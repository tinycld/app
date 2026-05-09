const fs = require('node:fs')
const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro')

const config = getDefaultConfig(__dirname)

// Sibling packages — including @tinycld/core itself — are symlinked into
// packages/<name> (scoped packages under packages/@scope/<name>, mirroring
// the node_modules layout). Their real paths live outside this repo (e.g.
// ../core, ../contacts). Metro only bundles files inside watchFolders, so
// we scan the packages/ tree, follow every symlink, and add each target
// to watchFolders + build a name → path map for the custom resolver.
const PACKAGES_DIR = path.join(__dirname, 'packages')
const siblingFolders = []
const siblingByName = new Map()

// For each sibling we record (a) its real path on disk and (b) a list of
// subpath patterns from its package.json exports map. We use the patterns
// to translate `@scope/pkg/<subpath>` imports into a real on-disk path stem
// (no extension), which Metro's standard file resolver then probes against
// every platform/extension candidate. We can't lean on Node's exports
// resolution for this because sibling source dirs mix .ts and .tsx files,
// and Node's exports field has no extension-fallback on a single wildcard.
const siblingExportsByName = new Map()

// Map of sibling realpath basename → in-tree symlink path. Used by the
// resolver below to redirect web-worker bundle URL fetches back through the
// project tree. Background: the `new Worker(new URL('./worker', ...))`
// Babel transform records the worker dependency by its absolutePath, which
// Metro's TreeFS canonicalizes to the sibling's realpath (outside the
// project tree). The serializer then emits the worker URL as
// `path.relative(serverRoot, realpath)`, which for our layout produces
// `../<sibling>/...`; `new URL(...)` strips the leading `..`, leaving the
// browser to fetch `/<sibling>/...`. Without this redirect, Metro's Server
// would resolve `./<sibling>/...` from `<serverRoot>/.` and 404 because no
// such directory exists under tinycld/.
const siblingRealBaseToSymlinkPath = new Map()

function scanPackagesDir(dir, scope) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        // A scope directory (e.g. @tinycld) is a real directory containing links.
        if (!scope && entry.name.startsWith('@') && entry.isDirectory()) {
            scanPackagesDir(path.join(dir, entry.name), entry.name)
            continue
        }
        // Any other entry must be a symlink pointing at a sibling checkout.
        if (!entry.isSymbolicLink()) continue
        const linkPath = path.join(dir, entry.name)
        try {
            const real = fs.realpathSync(linkPath)
            const name = scope ? `${scope}/${entry.name}` : entry.name
            if (!real.startsWith(__dirname)) siblingFolders.push(real)
            // siblingByName stores the symlink path inside the project tree
            // (tinycld/packages/<name>) rather than the realpath. Returning
            // resolutions through the symlink keeps every module path that
            // Metro embeds in serializer output (notably lazy-chunk URLs)
            // inside `path.relative(projectRoot, ...)` reach. The realpath
            // is still scanned for source — it lives in `siblingFolders`,
            // which is fed into watchFolders.
            siblingByName.set(name, linkPath)
            siblingExportsByName.set(name, loadExportsPatterns(real))
            siblingRealBaseToSymlinkPath.set(path.basename(real), linkPath)
        } catch {
            // dangling symlink — skip
        }
    }
}

// Read a sibling's package.json `exports` field and return a sorted list of
// { pattern, target } entries where pattern/target are relative paths whose
// trailing ".ext" suffix has been stripped. Sorted longest-prefix first so
// `./components/*` wins over `./*` for `./components/foo`.
function loadExportsPatterns(siblingRoot) {
    let pkg
    try {
        pkg = JSON.parse(fs.readFileSync(path.join(siblingRoot, 'package.json'), 'utf8'))
    } catch {
        return []
    }
    const exportsField = pkg.exports
    if (!exportsField || typeof exportsField !== 'object') return []
    const entries = []
    for (const [key, value] of Object.entries(exportsField)) {
        if (typeof value !== 'string') continue
        if (key === '.' || key === './package.json') continue
        entries.push({
            pattern: stripExt(key),
            target: stripExt(value),
        })
    }
    entries.sort((a, b) => b.pattern.length - a.pattern.length)
    return entries
}

function stripExt(specifier) {
    return specifier.replace(/\.(tsx|ts|jsx|js|mjs|cjs)$/, '')
}

// Try a list of platform/extension combinations against the path stem and
// return the first existing file. Mirrors the order Metro's default file
// resolver uses, but checks files via fs.existsSync against the literal
// (symlink-preserving) path so the resolved filePath stays inside this
// project tree rather than getting realpath'd into a sibling repo. Falls
// back to <stem>/index.<ext> so directory imports (e.g. `ui/divider`
// resolving to `ui/divider/index.tsx`) work.
const PROBE_EXTS = ['tsx', 'ts', 'jsx', 'js', 'mjs', 'cjs', 'json']
function probeSourceFile(stem, platform) {
    const tryExtensions = (base) => {
        if (platform) {
            for (const ext of PROBE_EXTS) {
                const candidate = `${base}.${platform}.${ext}`
                if (fs.existsSync(candidate)) return candidate
            }
        }
        for (const ext of PROBE_EXTS) {
            const candidate = `${base}.${ext}`
            if (fs.existsSync(candidate)) return candidate
        }
        return null
    }
    const direct = tryExtensions(stem)
    if (direct) return direct
    if (fs.existsSync(stem)) {
        try {
            if (fs.statSync(stem).isDirectory()) {
                const indexHit = tryExtensions(path.join(stem, 'index'))
                if (indexHit) return indexHit
            }
            return stem
        } catch {}
    }
    return null
}

// Translate an import like `@scope/pkg/components/Foo` into a real on-disk
// path stem like `<siblingRoot>/tinycld/pkg/components/Foo` (no extension)
// using the sibling's exports patterns.
function resolveSiblingSubpath(siblingRoot, siblingName, moduleName) {
    const subpath = `.${moduleName.slice(siblingName.length)}`
    const patterns = siblingExportsByName.get(siblingName) ?? []
    for (const { pattern, target } of patterns) {
        if (pattern.endsWith('/*')) {
            const prefix = pattern.slice(0, -1)
            if (subpath.startsWith(prefix)) {
                const rest = subpath.slice(prefix.length)
                const mapped = target.endsWith('/*') ? target.slice(0, -1) + rest : target
                return path.join(siblingRoot, mapped)
            }
        } else if (subpath === pattern) {
            return path.join(siblingRoot, target)
        }
    }
    return null
}

scanPackagesDir(PACKAGES_DIR, null)

config.watchFolders = [...(config.watchFolders ?? []), ...siblingFolders]

// Map <name> and <name>/<subpath> imports to the sibling's real path. Metro's
// default package-exports resolution would otherwise look the symlink up via
// node_modules walking and fail, because packages/ is not a node_modules dir.
const originalResolveRequest = config.resolver.resolveRequest
const APP_GENERATED_DIR = path.join(__dirname, 'lib', 'generated')

config.resolver.resolveRequest = (context, moduleName, platform) => {
    // zustand publishes both an ESM build (`./esm/*.mjs`, selected by Metro's
    // `import` condition for web) and a CJS build (`./*.js`, selected by the
    // `react-native` condition or by Node's plain `require`). The ESM build
    // contains `import.meta.env` references that crash Metro's CJS-style
    // runtime at module init. We bypass exports resolution entirely by
    // hand-resolving against tinycld's node_modules, which lands on the CJS
    // entry point regardless of platform.
    if (moduleName === 'zustand' || moduleName.startsWith('zustand/')) {
        const resolved = require.resolve(moduleName, {
            paths: [path.join(__dirname, 'node_modules')],
        })
        return { type: 'sourceFile', filePath: resolved }
    }

    // yjs and y-protocols use instanceof checks throughout (Y.Map,
    // Y.Array, AbstractType). When sibling-symlinked code resolves a
    // separate copy via Node's normal walk, nested type writes fail
    // with "Unexpected content type." Pin both packages to the app
    // shell's single install. Same shape as zustand above; same
    // reasoning as the vitest alias in vitest.config.ts.
    if (
        moduleName === 'yjs' ||
        moduleName === 'y-protocols' ||
        moduleName.startsWith('y-protocols/')
    ) {
        const resolved = require.resolve(moduleName, {
            paths: [path.join(__dirname, 'node_modules')],
        })
        return { type: 'sourceFile', filePath: resolved }
    }

    // Worker bundle URL fetches. When the browser hits
    // `/<sibling-real-base>/<rest>/worker.bundle?...`, Metro's Server calls
    // resolveRequest with `originModulePath = <projectRoot>/.` and
    // `moduleName = ./<sibling-real-base>/<rest>/worker`. The shape comes
    // from the worker URL being emitted as
    // `path.relative(serverRoot, <worker-realpath>)` and serialized through
    // `new URL(...)`, which strips a leading `..`. We redirect back through
    // the in-tree symlink so resolution lands on a path under
    // tinycld/packages/<name>/... instead of a non-existent
    // tinycld/<sibling-real-base>/...
    if (moduleName.startsWith('./') && isServerRootOrigin(context.originModulePath)) {
        const rest = moduleName.slice(2)
        const slash = rest.indexOf('/')
        const head = slash === -1 ? rest : rest.slice(0, slash)
        const symlinkRoot = siblingRealBaseToSymlinkPath.get(head)
        if (symlinkRoot) {
            const tail = slash === -1 ? '' : rest.slice(slash)
            const stem = symlinkRoot + tail
            const resolved = probeSourceFile(stem, platform)
            if (resolved) {
                return { type: 'sourceFile', filePath: resolved }
            }
        }
    }

    // @tinycld/app-generated/* — generator output written to lib/generated/.
    // Mirrors tinycld's tsconfig path alias; Metro doesn't honor tsconfig
    // paths, so we resolve here.
    if (moduleName.startsWith('@tinycld/app-generated/')) {
        const subpath = moduleName.slice('@tinycld/app-generated/'.length)
        return context.resolveRequest(
            context,
            path.join(APP_GENERATED_DIR, subpath),
            platform
        )
    }

    // Sibling subpath imports (e.g. `@tinycld/core/components/NotifyContextSync`)
    // resolve through the sibling's exports map, but with extension probing
    // restored. We translate the import to a real on-disk path stem (via
    // the symlink, NOT the realpath) and probe extensions ourselves. Going
    // via the symlink keeps every resolved module path under
    // `tinycld/packages/<name>/...`, which is critical for serializer
    // output that does `path.relative(projectRoot, modulePath)` (lazy chunk
    // URLs would otherwise contain `..` segments that browsers strip).
    // Doing this in Node's exports resolution doesn't work either, because
    // sibling source dirs mix .ts and .tsx within one wildcard and Node
    // can't fall back across extensions on a single key. Bare-package
    // imports (`@tinycld/core`) still go through the default resolver so
    // the exports map serves the entry point.
    const siblingName = resolveSiblingName(moduleName)
    if (siblingName) {
        const siblingRoot = siblingByName.get(siblingName)
        if (siblingRoot && moduleName.length > siblingName.length) {
            const stem = resolveSiblingSubpath(siblingRoot, siblingName, moduleName)
            if (stem) {
                const resolved = probeSourceFile(stem, platform)
                if (resolved) {
                    return { type: 'sourceFile', filePath: resolved }
                }
            }
        }
    }

    return (originalResolveRequest ?? context.resolveRequest)(context, moduleName, platform)
}

// Recognize the `<projectRoot>/.` originModulePath that Metro's Server
// passes when resolving an incoming bundle URL request. `path.join` strips
// the trailing dot, so we compare against the literal string Metro emits.
function isServerRootOrigin(originPath) {
    if (typeof originPath !== 'string') return false
    return originPath === `${__dirname}/.` || originPath === __dirname
}

// Pull the package name (scoped: @scope/name, unscoped: name) out of a
// module specifier. Returns null for relative paths and bare builtins that
// don't look like package names.
function resolveSiblingName(moduleName) {
    if (moduleName.startsWith('.') || moduleName.startsWith('/')) return null
    if (moduleName.startsWith('@')) {
        const parts = moduleName.split('/')
        return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null
    }
    const slash = moduleName.indexOf('/')
    return slash === -1 ? moduleName : moduleName.slice(0, slash)
}

// Sibling packages — including @tinycld/core — must have no node_modules of
// their own; they resolve every import through this repo's install. We do
// NOT add core's node_modules as a backstop: when a stray `bun install` in
// core leaves a node_modules/ behind, that fallback would feed duplicate
// copies of every shared package (react, react-native-web, uniwind, …) into
// Metro's graph and produce broken self-referential modules at runtime.
config.resolver.nodeModulesPaths = [
    ...(config.resolver.nodeModulesPaths ?? []),
    path.join(__dirname, 'node_modules'),
]

// Wrap Metro's module-ID factory so the same file gets the same ID no matter
// how it was reached. Sibling-package files have two valid representations
// in this graph: the symlink path under tinycld/packages/<name>/… (used by
// our custom resolver and by the lazy-chunk URL builder so `path.relative`
// stays inside the project root) and the realpath one level up (used by
// Metro's default resolver when it canonicalizes through fileSystemLookup
// for the lazy chunk's entry). Without canonicalization here, both paths
// hit `createModuleId` independently and the shared per-server module-ID
// Map hands them out two different IDs — the main bundle's `__r(<id>)` then
// fails to find the module the lazy chunk registered under a different ID.
const canonicalPathCache = new Map()
function canonicalizeModulePath(modulePath) {
    if (typeof modulePath !== 'string' || !path.isAbsolute(modulePath)) {
        return modulePath
    }
    const cached = canonicalPathCache.get(modulePath)
    if (cached !== undefined) return cached
    let canonical = modulePath
    try {
        canonical = fs.realpathSync(modulePath)
    } catch {
        // File may not exist (e.g. virtual modules) — fall back to as-is.
    }
    canonicalPathCache.set(modulePath, canonical)
    return canonical
}

const upstreamCreateModuleIdFactory = config.serializer?.createModuleIdFactory
if (upstreamCreateModuleIdFactory) {
    config.serializer = {
        ...config.serializer,
        createModuleIdFactory: () => {
            const upstream = upstreamCreateModuleIdFactory()
            return (modulePath, context) =>
                upstream(canonicalizeModulePath(modulePath), context)
        },
    }
}

module.exports = withUniwindConfig(config, {
    cssEntryFile: './global.css',
    dtsFile: './uniwind-types.d.ts',
    extraThemes: ['dark'],
})
