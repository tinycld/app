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
            siblingByName.set(name, real)
        } catch {
            // dangling symlink — skip
        }
    }
}

scanPackagesDir(PACKAGES_DIR, null)

config.watchFolders = [...(config.watchFolders ?? []), ...siblingFolders]

// Map <name> and <name>/<subpath> imports to the sibling's real path. Metro's
// default package-exports resolution would otherwise look the symlink up via
// node_modules walking and fail, because packages/ is not a node_modules dir.
const originalResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName.startsWith('zustand')) {
        const resolved = require.resolve(moduleName, { paths: [context.originModulePath] })
        return { type: 'sourceFile', filePath: resolved }
    }

    const siblingName = resolveSiblingName(moduleName)
    if (siblingName) {
        const siblingRoot = siblingByName.get(siblingName)
        if (siblingRoot) {
            return context.resolveRequest(context, moduleName, platform, {
                ...context,
                originModulePath: path.join(siblingRoot, 'package.json'),
            })
        }
    }

    return (originalResolveRequest ?? context.resolveRequest)(context, moduleName, platform)
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

// Sibling packages have no node_modules of their own — they inherit deps
// from this repo via the symlink. Tell Metro to look in our node_modules
// (and core's, as a backstop) when resolving imports from any file.
config.resolver.nodeModulesPaths = [
    ...(config.resolver.nodeModulesPaths ?? []),
    path.join(__dirname, 'node_modules'),
    path.join(__dirname, 'packages', '@tinycld', 'core', 'node_modules'),
]

module.exports = withUniwindConfig(config, {
    cssEntryFile: './global.css',
    dtsFile: './uniwind-types.d.ts',
    extraThemes: ['dark'],
})
