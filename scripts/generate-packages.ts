import { type ChildProcess, execSync, spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

// ROOT is the source of truth — every other path derives from it or from an
// explicit override env var. Default: parent of the scripts/ directory.
const ROOT = process.env.TINYCLD_APP_ROOT
    ? path.resolve(process.env.TINYCLD_APP_ROOT)
    : path.resolve(import.meta.dirname, '..')

// GENERATED_DIR is the TypeScript output target.
const GENERATED_DIR = process.env.TINYCLD_GENERATED_DIR
    ? path.resolve(process.env.TINYCLD_GENERATED_DIR)
    : path.join(ROOT, 'lib/generated')

// APP_DIR hosts the generated route re-exports. Both the org-scoped routes
// (a/[orgSlug]/...) and public routes (publicRoutes) land under here.
const APP_DIR = process.env.TINYCLD_APP_DIR
    ? path.resolve(process.env.TINYCLD_APP_DIR)
    : path.join(ROOT, 'app')

const ROUTES_BASE = path.join(APP_DIR, 'a/[orgSlug]')

// SERVER_DIR hosts the Go module, generator-written package_extensions.go,
// bundled-packages.json, and the pb_migrations / pb_hooks symlink landing
// dirs. After the split the app sibling owns a thin server/ with its own
// go.mod; override here for that layout.
const SERVER_DIR = process.env.TINYCLD_SERVER_DIR
    ? path.resolve(process.env.TINYCLD_SERVER_DIR)
    : path.join(ROOT, 'server')

const MIGRATIONS_DIR = path.join(SERVER_DIR, 'pb_migrations')
const HOOKS_DIR = path.join(SERVER_DIR, 'pb_hooks')

// CORE_MIGRATIONS_SOURCE points at core's own migrations so we can symlink
// them into the app server's pb_migrations/ alongside sibling migrations.
// Core isn't in the package registry (no manifest.ts), so its migrations
// aren't picked up by the per-package loop below; we handle them explicitly.
// Default: TINYCLD_CORE_MIGRATIONS_DIR env var, or the conventional sibling
// symlink location at packages/@tinycld/core/server/pb_migrations.
const CORE_MIGRATIONS_SOURCE = process.env.TINYCLD_CORE_MIGRATIONS_DIR
    ? path.resolve(process.env.TINYCLD_CORE_MIGRATIONS_DIR)
    : path.join(ROOT, 'packages/@tinycld/core/server/pb_migrations')

// CORE_HELP_SOURCE points at core's own help/ directory. Core has no
// manifest.ts so its topics aren't picked up by the per-package loop; the
// help generator includes it explicitly the same way migrations are above.
const CORE_HELP_SOURCE = process.env.TINYCLD_CORE_HELP_DIR
    ? path.resolve(process.env.TINYCLD_CORE_HELP_DIR)
    : path.join(ROOT, 'packages/@tinycld/core/help')

const LINKS_MANIFEST = path.join(ROOT, '.package-links.json')
const INSTALLED_PACKAGES_PATH = path.join(ROOT, 'installed-packages.json')

interface PackageManifest {
    name: string
    slug: string
    version: string
    description: string
    routes?: { directory: string }
    publicRoutes?: { directory: string }
    nav?: { label: string; icon: string; order?: number; shortcut?: string }
    migrations?: { directory: string }
    hooks?: { directory: string }
    collections?: { register: string; types: string }
    sidebar?: { component: string }
    provider?: { component: string }
    settings?: { slug: string; component: string; label: string }[]
    seed?: { script: string }
    tests?: { directory: string }
    server?: { package: string; module: string }
    help?: { directory: string }
    build?: { script: string }
    dependencies?: string[]
}

function validateNavShortcuts(packagesInfo: { packageName: string; manifest: PackageManifest }[]) {
    const seen = new Map<string, string>()
    for (const { packageName, manifest } of packagesInfo) {
        const letter = manifest.nav?.shortcut
        if (!letter) continue
        if (letter.length !== 1) {
            throw new Error(
                `Package ${packageName}: nav.shortcut must be a single character, got "${letter}"`
            )
        }
        const previous = seen.get(letter)
        if (previous) {
            throw new Error(
                `Conflicting nav.shortcut "${letter}" between ${previous} and ${packageName}`
            )
        }
        seen.set(letter, packageName)
    }
}

// topologicallyOrderForSeeds returns the packages in dependency order:
// for any package P, every package listed in `P.manifest.dependencies` (by
// slug) appears before P. Falls back to insertion order for packages
// that have no dependency relation. Cycles fall back to insertion order
// without throwing — seed ordering is best-effort and the caller has
// already accepted whatever order the manifest declares.
function topologicallyOrderForSeeds(
    packagesInfo: { packageName: string; manifest: PackageManifest }[]
): { packageName: string; manifest: PackageManifest }[] {
    const bySlug = new Map(packagesInfo.map(p => [p.manifest.slug, p]))
    const visited = new Set<string>()
    const result: { packageName: string; manifest: PackageManifest }[] = []
    const inProgress = new Set<string>()

    const visit = (pkg: { packageName: string; manifest: PackageManifest }) => {
        if (visited.has(pkg.manifest.slug)) return
        if (inProgress.has(pkg.manifest.slug)) return
        inProgress.add(pkg.manifest.slug)
        for (const depSlug of pkg.manifest.dependencies ?? []) {
            const dep = bySlug.get(depSlug)
            if (dep) visit(dep)
        }
        inProgress.delete(pkg.manifest.slug)
        visited.add(pkg.manifest.slug)
        result.push(pkg)
    }

    for (const pkg of packagesInfo) visit(pkg)
    return result
}

interface InstalledPackageEntry {
    npmPackage: string
    slug: string
    installedAt: string
}

interface LinksManifest {
    symlinks: string[]
    generatedFiles: string[]
}

function loadInstalledPackages(): InstalledPackageEntry[] {
    try {
        return JSON.parse(fs.readFileSync(INSTALLED_PACKAGES_PATH, 'utf-8'))
    } catch {
        return []
    }
}

function loadPreviousLinks(): LinksManifest {
    try {
        return JSON.parse(fs.readFileSync(LINKS_MANIFEST, 'utf-8'))
    } catch {
        return { symlinks: [], generatedFiles: [] }
    }
}

function cleanPrevious(manifest: LinksManifest) {
    for (const filePath of [...manifest.symlinks, ...manifest.generatedFiles]) {
        try {
            const stat = fs.lstatSync(filePath)
            if (stat.isSymbolicLink() || stat.isFile()) {
                fs.unlinkSync(filePath)
            }
        } catch {
            // already gone
        }
    }

    // Clean empty generated route directories
    const routeDirs = new Set(
        manifest.generatedFiles.filter(f => f.startsWith(ROUTES_BASE)).map(f => path.dirname(f))
    )
    for (const dir of Array.from(routeDirs).sort((a, b) => b.length - a.length)) {
        try {
            const entries = fs.readdirSync(dir)
            if (entries.length === 0) {
                fs.rmdirSync(dir)
            }
        } catch {
            // directory already gone
        }
    }
}

/**
 * Given a package directory and a logical subpath (like 'screens' or 'collections'),
 * resolve it to the physical directory/file using the package.json exports map.
 * Falls back to the subpath itself if no exports match.
 */
function resolveExportPath(packageDir: string, subpath: string): string {
    const pkgJsonPath = path.join(packageDir, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) return path.join(packageDir, subpath)

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
    const exports = pkgJson.exports ?? {}

    // Try exact match first: "./<subpath>"
    const exactKey = `./${subpath}`
    if (exports[exactKey]) {
        const target = exports[exactKey]
        // Strip leading ./ and extension for directory-style entries
        return path.join(packageDir, target.replace(/^\.\//, '').replace(/\.[^.]+$/, ''))
    }

    // Try wildcard match: "./<base>/*" where subpath starts with "<base>/"
    for (const [key, value] of Object.entries(exports)) {
        if (!key.endsWith('/*')) continue
        const base = key.slice(2, -2) // strip "./" and "/*"
        if (subpath === base || subpath.startsWith(`${base}/`)) {
            const pattern = (value as string).replace(/^\.\//, '')
            // Replace the wildcard pattern base with the actual subpath
            const dir = pattern.split('/*')[0]
            if (subpath === base) return path.join(packageDir, dir)
            const rest = subpath.slice(base.length + 1)
            return path.join(packageDir, dir, rest)
        }
    }

    return path.join(packageDir, subpath)
}

export function resolvePackageDir(packageName: string): string {
    // Primary: node_modules/<name>, the npm workspace symlink (feature members
    // resolve here; core too). Use realpathSync so downstream path operations
    // produce stable absolute paths and don't rely on the link.
    const nodeModulesPath = path.join(ROOT, 'node_modules', packageName)
    if (fs.existsSync(nodeModulesPath)) {
        return fs.realpathSync(nodeModulesPath)
    }
    // Fallback: bundled core lives at packages/@tinycld/core (a real dir, not a
    // workspace symlink target under node_modules in every layout).
    const packagesPath = path.join(ROOT, 'packages', packageName)
    if (fs.existsSync(packagesPath)) {
        return fs.realpathSync(packagesPath)
    }
    throw new Error(`Cannot resolve package directory for ${packageName}`)
}

export function loadManifest(packageDir: string): PackageManifest {
    for (const ext of ['ts', 'js']) {
        const manifestPath = path.join(packageDir, `manifest.${ext}`)
        if (!fs.existsSync(manifestPath)) continue
        const content = fs.readFileSync(manifestPath, 'utf-8')

        // Match either `export default { ... }` or `const/let/var X = { ... }`
        const match =
            content.match(/(?:export\s+default|module\.exports\s*=)\s*(\{[\s\S]*\})/) ??
            content.match(/(?:const|let|var)\s+\w+\s*=\s*(\{[\s\S]*\})\s*(?:;?\s*$)/m)
        if (match) {
            const obj = new Function(`return (${match[1]})`)()
            return obj as PackageManifest
        }
    }
    throw new Error(`No manifest found in ${packageDir}`)
}

function walkFiles(dir: string, base = ''): string[] {
    if (!fs.existsSync(dir)) return []
    const results: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.join(base, entry.name)
        if (entry.isDirectory()) {
            results.push(...walkFiles(path.join(dir, entry.name), rel))
        } else {
            results.push(rel)
        }
    }
    return results
}

function generateRoutes(
    packageName: string,
    manifest: PackageManifest,
    packageDir: string
): string[] {
    if (!manifest.routes?.directory) return []
    const screensDir = resolveExportPath(packageDir, manifest.routes.directory)
    const files = walkFiles(screensDir)
    const generated: string[] = []

    const pkgRouteDir = path.join(ROUTES_BASE, manifest.slug)
    fs.mkdirSync(pkgRouteDir, { recursive: true })

    for (const file of files) {
        const ext = path.extname(file)
        if (!['.tsx', '.ts', '.jsx', '.js'].includes(ext)) continue

        const withoutExt = file.replace(/\.[^.]+$/, '')
        const importPath = `${packageName}/${manifest.routes.directory}/${withoutExt}`
        const outFile = path.join(pkgRouteDir, file)

        fs.mkdirSync(path.dirname(outFile), { recursive: true })
        fs.writeFileSync(outFile, `export { default } from '${importPath}'\n`)
        generated.push(outFile)
    }

    return generated
}

export function generatePublicRoutesAt(
    packageName: string,
    manifest: Pick<PackageManifest, 'publicRoutes'>,
    packageDir: string,
    appDir: string
): string[] {
    if (!manifest.publicRoutes?.directory) return []

    const sourceDir = resolveExportPath(packageDir, manifest.publicRoutes.directory)
    if (!fs.existsSync(sourceDir)) return []

    const files = walkFiles(sourceDir)
    const generated: string[] = []

    for (const file of files) {
        const ext = path.extname(file)
        if (!['.tsx', '.ts', '.jsx', '.js'].includes(ext)) continue

        const withoutExt = file.replace(/\.[^.]+$/, '')
        const importPath = `${packageName}/${manifest.publicRoutes.directory}/${withoutExt}`
        const outFile = path.join(appDir, file)

        fs.mkdirSync(path.dirname(outFile), { recursive: true })
        fs.writeFileSync(outFile, `export { default } from '${importPath}'\n`)
        generated.push(outFile)
    }

    return generated
}

function generatePublicRoutes(
    packageName: string,
    manifest: PackageManifest,
    packageDir: string
): string[] {
    return generatePublicRoutesAt(packageName, manifest, packageDir, APP_DIR)
}

export function detectPublicRouteConflicts(
    packagesInfo: {
        packageName: string
        manifest: Pick<PackageManifest, 'publicRoutes'>
        packageDir: string
    }[],
    appDir: string
): void {
    const publicRoutePaths = new Map<string, string>()
    for (const { packageName, manifest: m, packageDir: pd } of packagesInfo) {
        if (!m.publicRoutes?.directory) continue
        const src = resolveExportPath(pd, m.publicRoutes.directory)
        if (!fs.existsSync(src)) continue
        for (const rel of walkFiles(src)) {
            const ext = path.extname(rel)
            if (!['.tsx', '.ts', '.jsx', '.js'].includes(ext)) continue
            const key = path.join(appDir, rel)
            const previous = publicRoutePaths.get(key)
            if (previous && previous !== packageName) {
                throw new Error(
                    `Public route conflict: "${rel}" declared by both ${previous} and ${packageName}`
                )
            }
            publicRoutePaths.set(key, packageName)
        }
    }
}

export function replaceSymlink(source: string, target: string): void {
    let existing: fs.Stats | undefined
    try {
        existing = fs.lstatSync(target)
    } catch {
        // target doesn't exist
    }

    if (existing) {
        if (!existing.isSymbolicLink()) {
            throw new Error(
                `Refusing to replace regular file at ${target} — the generator only manages symlinks`
            )
        }
        const currentTarget = fs.readlinkSync(target)
        if (currentTarget === source) return
        try {
            fs.unlinkSync(target)
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
        }
    }

    try {
        fs.symlinkSync(source, target)
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
        // Another concurrent generator created the same link; accept it if it
        // points at our source, otherwise replace it.
        const currentTarget = fs.readlinkSync(target)
        if (currentTarget === source) return
        fs.unlinkSync(target)
        fs.symlinkSync(source, target)
    }
}

export interface SymlinkDirs {
    migrationsDir: string
    hooksDir: string
}

export function createSymlinksAt(
    manifest: Pick<PackageManifest, 'migrations' | 'hooks'>,
    packageDir: string,
    dirs: SymlinkDirs
): string[] {
    const created: string[] = []

    if (manifest.migrations?.directory) {
        const migrationsSource = path.join(packageDir, manifest.migrations.directory)
        if (fs.existsSync(migrationsSource)) {
            for (const file of fs.readdirSync(migrationsSource)) {
                const target = path.join(dirs.migrationsDir, file)
                const source = path.join(migrationsSource, file)
                replaceSymlink(source, target)
                created.push(target)
            }
        }
    }

    if (manifest.hooks?.directory) {
        const hooksSource = path.join(packageDir, manifest.hooks.directory)
        if (fs.existsSync(hooksSource)) {
            fs.mkdirSync(dirs.hooksDir, { recursive: true })
            for (const file of fs.readdirSync(hooksSource)) {
                const target = path.join(dirs.hooksDir, file)
                const source = path.join(hooksSource, file)
                replaceSymlink(source, target)
                created.push(target)
            }
        }
    }

    return created
}

function createSymlinks(manifest: PackageManifest, packageDir: string): string[] {
    return createSymlinksAt(manifest, packageDir, {
        migrationsDir: MIGRATIONS_DIR,
        hooksDir: HOOKS_DIR,
    })
}

function slugToIdentifier(slug: string): string {
    return slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

interface HelpContributor {
    packageName: string
    pkgSlug: string
    helpDir: string
}

interface ParsedHelpTopic {
    id: string
    title: string
    summary: string
    tags: string[]
    order: number
    body: string
}

// Minimal YAML frontmatter parser. Supports the subset we use in help topics:
// scalar strings (quoted or bare), numbers, and inline string arrays
// (`tags: [a, "b c", 'd']`). Anything more complex throws — the caller
// should keep frontmatter tiny.
function parseFrontmatter(
    raw: string,
    filePath: string
): { meta: Record<string, unknown>; body: string } {
    if (!raw.startsWith('---')) {
        throw new Error(`Help topic ${filePath} is missing a frontmatter block (--- … ---)`)
    }
    const end = raw.indexOf('\n---', 3)
    if (end === -1) {
        throw new Error(`Help topic ${filePath} has an unterminated frontmatter block`)
    }
    const block = raw.slice(3, end).replace(/^\r?\n/, '')
    const afterClose = raw.slice(end + 4)
    const body = afterClose.replace(/^\r?\n/, '')

    const meta: Record<string, unknown> = {}
    for (const rawLine of block.split('\n')) {
        const line = rawLine.replace(/\s+$/, '')
        if (!line.trim() || line.trim().startsWith('#')) continue
        const colon = line.indexOf(':')
        if (colon === -1) {
            throw new Error(`Help topic ${filePath}: malformed frontmatter line "${rawLine}"`)
        }
        const key = line.slice(0, colon).trim()
        const value = line.slice(colon + 1).trim()
        meta[key] = parseFrontmatterValue(value, filePath, key)
    }
    return { meta, body }
}

function parseFrontmatterValue(raw: string, filePath: string, key: string): unknown {
    if (raw === '') return ''
    if (raw.startsWith('[') && raw.endsWith(']')) {
        const inner = raw.slice(1, -1).trim()
        if (!inner) return [] as string[]
        const items: string[] = []
        // Split on commas not inside quotes
        let buf = ''
        let quote: '"' | "'" | null = null
        for (const ch of inner) {
            if (quote) {
                if (ch === quote) {
                    quote = null
                    continue
                }
                buf += ch
            } else if (ch === '"' || ch === "'") {
                quote = ch
            } else if (ch === ',') {
                items.push(buf.trim())
                buf = ''
            } else {
                buf += ch
            }
        }
        if (buf.trim()) items.push(buf.trim())
        return items
    }
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
        return raw.slice(1, -1)
    }
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
    if (raw === 'true') return true
    if (raw === 'false') return false
    // Bare scalar — return as-is. Reject anything that looks structured to
    // avoid silently mis-parsing a future expansion of the schema.
    if (raw.includes(':') && !raw.startsWith('#')) {
        throw new Error(
            `Help topic ${filePath}: value for "${key}" looks structured ("${raw}"); quote it or simplify`
        )
    }
    return raw
}

function readHelpContributor(c: HelpContributor) {
    if (!fs.existsSync(c.helpDir)) return null
    const entries = fs
        .readdirSync(c.helpDir, { withFileTypes: true })
        .filter(e => e.isFile() && e.name.endsWith('.md'))
    if (entries.length === 0) return null

    const topics: ParsedHelpTopic[] = entries.map(entry => {
        const mdPath = path.join(c.helpDir, entry.name)
        const raw = fs.readFileSync(mdPath, 'utf-8')
        const { meta, body } = parseFrontmatter(raw, mdPath)
        const id = entry.name.replace(/\.md$/, '')

        const title = meta.title
        const summary = meta.summary
        if (typeof title !== 'string' || !title) {
            throw new Error(`Help topic ${mdPath}: frontmatter "title" is required`)
        }
        if (typeof summary !== 'string' || !summary) {
            throw new Error(`Help topic ${mdPath}: frontmatter "summary" is required`)
        }
        const tags = Array.isArray(meta.tags) ? (meta.tags as unknown[]).map(String) : []
        const order = typeof meta.order === 'number' ? meta.order : Number.POSITIVE_INFINITY

        return { id, title, summary, tags, order, body }
    })

    topics.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)))
    return { ...c, topics }
}

function generateHelpFile(contributors: HelpContributor[]): string {
    const header = [
        '// Auto-generated by scripts/generate-packages.ts — do not edit',
        '',
        'export interface HelpTopicEntry {',
        '    id: string',
        '    pkgSlug: string',
        '    topicId: string',
        '    title: string',
        '    summary: string',
        '    tags: string[]',
        '    body: string',
        '}',
        '',
        'export interface HelpGroup {',
        '    packageName: string',
        '    pkgSlug: string',
        '    topics: HelpTopicEntry[]',
        '}',
        '',
    ]

    const groups: string[] = []
    for (const c of contributors) {
        const loaded = readHelpContributor(c)
        if (!loaded || loaded.topics.length === 0) continue

        const topicLines = loaded.topics.map(t => {
            const entry = {
                id: `${c.pkgSlug}:${t.id}`,
                pkgSlug: c.pkgSlug,
                topicId: t.id,
                title: t.title,
                summary: t.summary,
                tags: t.tags,
                body: t.body,
            }
            return `            ${JSON.stringify(entry)},`
        })

        groups.push(
            [
                '    {',
                `        packageName: ${JSON.stringify(c.packageName)},`,
                `        pkgSlug: ${JSON.stringify(c.pkgSlug)},`,
                '        topics: [',
                ...topicLines,
                '        ],',
                '    },',
            ].join('\n')
        )
    }

    return [...header, 'export const packageHelp: HelpGroup[] = [', ...groups, ']', ''].join('\n')
}

// Tailwind v4's scanner respects .gitignore, which causes any utility class
// used only inside a linked package to silently produce no CSS rule (the
// className lands on the DOM, but no .my-class { ... } rule exists). Emit one
// absolute @source directive per linked package so the scanner walks each
// package's real on-disk source tree regardless of where it lives. global.css
// imports the file this generates.
function generateUniwindSourcesFile(
    packagesInfo: { packageName: string; manifest: PackageManifest; packageDir: string }[]
): string {
    const lines = [
        '/* Auto-generated by scripts/generate-packages.ts — do not edit. */',
        '/* Regenerated on every packages:generate run. */',
    ]
    for (const { packageName, packageDir } of packagesInfo) {
        // Use the resolved real path so the directive works whether the package
        // is a symlink to a sibling repo, an npm install under node_modules,
        // or a checkout anywhere else on disk.
        lines.push(`@source "${packageDir}";  /* ${packageName} */`)
    }
    return `${lines.join('\n')}\n`
}

function generateSeedsFile(
    packagesInfo: { packageName: string; manifest: PackageManifest }[]
): string {
    // Topologically order seeds so a package's `dependencies` run first.
    // Without this, alphabetical insertion order breaks seeds that
    // observe earlier-package state — e.g. drive seed early-returns when
    // any drive_items already exist, so calc must seed AFTER drive.
    const withSeeds = topologicallyOrderForSeeds(packagesInfo.filter(a => a.manifest.seed?.script))

    if (withSeeds.length === 0) {
        return [
            '// Auto-generated by scripts/generate-packages.ts — do not edit',
            "import type PocketBase from 'pocketbase'",
            '',
            'export interface SeedContext {',
            '    user: { id: string; email: string; name: string }',
            '    org: { id: string }',
            '    userOrg: { id: string }',
            '}',
            '',
            'export type PackageSeedFn = (pb: PocketBase, context: SeedContext) => Promise<void>',
            '',
            'export const packageSeeds: Record<string, PackageSeedFn> = {}',
            '',
        ].join('\n')
    }

    const imports = withSeeds.map(a => {
        const id = slugToIdentifier(a.manifest.slug)
        return `import ${id}Seed from '${a.packageName}/${a.manifest.seed?.script}'`
    })

    const entries = withSeeds.map(a => {
        const id = slugToIdentifier(a.manifest.slug)
        return `    '${a.manifest.slug}': ${id}Seed,`
    })

    return [
        '// Auto-generated by scripts/generate-packages.ts — do not edit',
        "import type PocketBase from 'pocketbase'",
        ...imports,
        '',
        'export interface SeedContext {',
        '    user: { id: string; email: string; name: string }',
        '    org: { id: string }',
        '    userOrg: { id: string }',
        '}',
        '',
        'export type PackageSeedFn = (pb: PocketBase, context: SeedContext) => Promise<void>',
        '',
        'export const packageSeeds: Record<string, PackageSeedFn> = {',
        ...entries,
        '}',
        '',
    ].join('\n')
}

function generatePackageExtensionsGo(
    packagesInfo: { packageName: string; manifest: PackageManifest; packageDir: string }[]
): string {
    const withServer = packagesInfo.filter(
        a =>
            a.manifest.server?.package &&
            fs.existsSync(path.join(a.packageDir, a.manifest.server.package))
    )

    if (withServer.length === 0) {
        return [
            '// Code generated by scripts/generate-packages.ts. DO NOT EDIT.',
            'package main',
            '',
            'import "github.com/pocketbase/pocketbase"',
            '',
            'func registerPackageExtensions(_ *pocketbase.PocketBase) {}',
            '',
        ].join('\n')
    }

    const imports = withServer.map(a => {
        const id = slugToIdentifier(a.manifest.slug)
        return `\t${id} "${a.manifest.server?.module}"`
    })

    const calls = withServer.map(a => {
        const id = slugToIdentifier(a.manifest.slug)
        return `\t${id}.Register(app)`
    })

    return [
        '// Code generated by scripts/generate-packages.ts. DO NOT EDIT.',
        'package main',
        '',
        'import (',
        '\t"github.com/pocketbase/pocketbase"',
        ...imports,
        ')',
        '',
        'func registerPackageExtensions(app *pocketbase.PocketBase) {',
        ...calls,
        '}',
        '',
    ].join('\n')
}

function updateGoWork(
    packagesInfo: { packageName: string; manifest: PackageManifest; packageDir: string }[]
) {
    // Sibling Go modules wire into the app server through go.work, not go.mod.
    // The tracked server/go.mod stays lean (only the bundled core); go.work is
    // gitignored and lists the bundled core plus every linked sibling's server/
    // as workspace modules. This avoids mutating a tracked file on every
    // link/unlink and keeps fresh clones / CI building without sibling
    // resolution attempts.
    //
    // Once go.work is active, `replace` directives in the app server's go.mod
    // (including `replace tinycld.org/core => ../packages/@tinycld/core/server`)
    // are SHADOWED by the workspace. So core has to be a `use` entry too —
    // otherwise `go mod download` / `go build` can't find tinycld.org/core
    // and fails with "use go work edit -replace tinycld.org/core=[override]".
    const withServer = packagesInfo.filter(
        a =>
            a.manifest.server?.package &&
            fs.existsSync(path.join(a.packageDir, a.manifest.server.package))
    )

    const goWorkPath = path.join(SERVER_DIR, 'go.work')

    if (withServer.length === 0) {
        if (fs.existsSync(goWorkPath)) fs.unlinkSync(goWorkPath)
        const goWorkSumPath = path.join(SERVER_DIR, 'go.work.sum')
        if (fs.existsSync(goWorkSumPath)) fs.unlinkSync(goWorkSumPath)
        return
    }

    const coreServerPath = path.join(ROOT, 'packages/@tinycld/core/server')
    const coreRelPath = path.relative(SERVER_DIR, coreServerPath)

    const uses = withServer.map(a => {
        const relPath = path.relative(
            SERVER_DIR,
            path.join(a.packageDir, a.manifest.server?.package ?? '')
        )
        return `    ${relPath}`
    })

    const content = [
        'go 1.25.0',
        '',
        'use (',
        '    .',
        `    ${coreRelPath}`,
        ...uses,
        ')',
        '',
    ].join('\n')

    fs.writeFileSync(goWorkPath, content)
}

function runGoWorkSync() {
    // Skip cleanly when go isn't installed at all (e.g. the Docker Node-only
    // build stage). Any other failure — bad workspace, missing dep — should
    // surface to the developer instead of being swallowed.
    try {
        execSync('command -v go', { stdio: 'ignore' })
    } catch {
        return
    }

    // Only sync when a workspace exists. With no linked sibling servers
    // there's no go.work and nothing to sync — the lean shell's go.mod is
    // already canonical and `go build` resolves only against it.
    if (!fs.existsSync(path.join(SERVER_DIR, 'go.work'))) return

    try {
        execSync('go work sync', { cwd: SERVER_DIR, stdio: 'inherit' })
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`\ngenerate-packages: go work sync failed: ${msg}\n`)
        process.stderr.write(
            'generate-packages: continuing — go.work may be in an inconsistent state\n'
        )
    }
}

// Resolve a manifest `build.script` value to a concrete on-disk path.
// resolveExportPath is unsuitable here — it strips file extensions for
// directory-style entries — so we look for the actual file. A package
// can declare `build: { script: 'build' }` and ship either `build.ts`,
// `build.js`, or `build.mjs` in its package root (or behind an exports
// alias).
function resolveBuildScriptPath(packageDir: string, script: string): string {
    // Prefer an exports-map entry. Try literal extensions first; fall back
    // to resolveExportPath's strip-and-rewrite for bare-subpath entries.
    const pkgJsonPath = path.join(packageDir, 'package.json')
    const exportsMap: Record<string, string> = fs.existsSync(pkgJsonPath)
        ? (JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')).exports ?? {})
        : {}
    const exactKey = `./${script}`
    const exportTarget = exportsMap[exactKey]
    if (typeof exportTarget === 'string') {
        const abs = path.join(packageDir, exportTarget.replace(/^\.\//, ''))
        if (fs.existsSync(abs)) return abs
    }
    // No exports entry — try the script as a direct path with common
    // build-script extensions, then bare (the manifest may already include
    // the extension).
    for (const ext of ['.ts', '.mjs', '.js']) {
        const candidate = path.join(packageDir, `${script}${ext}`)
        if (fs.existsSync(candidate)) return candidate
    }
    const bare = path.join(packageDir, script)
    if (fs.existsSync(bare)) return bare
    throw new Error(
        `Package build script not found: tried ./${script}.{ts,mjs,js} and ./${script} under ${packageDir}`
    )
}

export interface BuildRunOptions {
    mode: 'build' | 'dev'
    watch: boolean
}

export interface RunningBuild {
    packageName: string
    child: ChildProcess
    exited: Promise<void>
}

// Locate the app shell's tsx binary. Sibling packages have no node_modules
// of their own (by design — see CLAUDE.md). Spawning bare `npx tsx` would
// resolve from $PATH or trigger an interactive download, which we want to
// avoid. The app shell always has tsx installed locally.
function tsxBinary(): string {
    const local = path.join(ROOT, 'node_modules/.bin/tsx')
    if (fs.existsSync(local)) return local
    // Fallback for unusual install layouts (pnpm/yarn worktrees, etc.).
    return 'tsx'
}

export function runPackageBuilds(
    packagesInfo: { packageName: string; manifest: PackageManifest; packageDir: string }[],
    opts: BuildRunOptions
): RunningBuild[] {
    const withBuilds = packagesInfo.filter(a => a.manifest.build?.script)
    if (withBuilds.length === 0) return []

    const running: RunningBuild[] = []

    for (const { packageName, manifest, packageDir } of withBuilds) {
        const scriptPath = resolveBuildScriptPath(packageDir, manifest.build?.script ?? '')
        const args = [scriptPath]
        if (opts.watch) args.push('--watch')

        const label = `build:${manifest.slug}`
        process.stdout.write(`[${label}] starting (${opts.mode}${opts.watch ? ', watch' : ''})\n`)

        const child = spawn(tsxBinary(), args, {
            cwd: packageDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                TINYCLD_PACKAGE_DIR: packageDir,
                TINYCLD_PACKAGE_NAME: packageName,
                TINYCLD_PACKAGE_SLUG: manifest.slug,
                TINYCLD_APP_ROOT: ROOT,
                TINYCLD_BUILD_MODE: opts.mode,
                TINYCLD_BUILD_WATCH: opts.watch ? '1' : '0',
            },
        })

        const prefix = `[${label}]`
        child.stdout?.on('data', (chunk: Buffer) => {
            for (const line of chunk.toString('utf8').split('\n')) {
                if (line.length > 0) process.stdout.write(`${prefix} ${line}\n`)
            }
        })
        child.stderr?.on('data', (chunk: Buffer) => {
            for (const line of chunk.toString('utf8').split('\n')) {
                if (line.length > 0) process.stderr.write(`${prefix} ${line}\n`)
            }
        })

        const exited = new Promise<void>((resolve, reject) => {
            child.on('exit', (code, signal) => {
                if (signal) {
                    // killed by us during shutdown — not an error
                    resolve()
                    return
                }
                if (code === 0) {
                    resolve()
                    return
                }
                reject(new Error(`${label} exited with code ${code}`))
            })
            child.on('error', reject)
        })

        running.push({ packageName, child, exited })
    }

    return running
}

// One-shot build: spawn every declared build script, wait for completion,
// throw if any fails. Used during `packages:generate` (no watch).
async function runPackageBuildsOnce(
    packagesInfo: { packageName: string; manifest: PackageManifest; packageDir: string }[]
): Promise<void> {
    const running = runPackageBuilds(packagesInfo, { mode: 'build', watch: false })
    if (running.length === 0) return
    const failures: string[] = []
    await Promise.all(
        running.map(r =>
            r.exited.catch((err: unknown) => {
                failures.push(
                    `${r.packageName}: ${err instanceof Error ? err.message : String(err)}`
                )
            })
        )
    )
    if (failures.length > 0) {
        throw new Error(
            `${failures.length} package build(s) failed:\n  - ${failures.join('\n  - ')}`
        )
    }
}

async function main() {
    // Scan packages/ for bundled packages
    const { getPackages } = await import('../tinycld.packages')
    const bundledPkgNames = getPackages()

    // Merge with runtime-installed packages (dedup by package name)
    const installedEntries = loadInstalledPackages()
    const bundledSet = new Set(bundledPkgNames)
    const installedPkgNames = installedEntries
        .map(e => e.npmPackage)
        .filter(name => !bundledSet.has(name))
    const pkgNames = [...bundledPkgNames, ...installedPkgNames]

    // Clean previous generated files (check both old and new manifests)
    const previousLinks = loadPreviousLinks()
    cleanPrevious(previousLinks)

    // Also clean old addon-links.json if it exists
    const oldLinksPath = path.join(ROOT, '.addon-links.json')
    try {
        const oldLinks = JSON.parse(fs.readFileSync(oldLinksPath, 'utf-8'))
        cleanPrevious(oldLinks)
        fs.unlinkSync(oldLinksPath)
    } catch {
        // no old manifest
    }

    // Ensure output dirs
    fs.mkdirSync(GENERATED_DIR, { recursive: true })
    fs.mkdirSync(ROUTES_BASE, { recursive: true })
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true })

    // NOTE: the node_modules/@tinycld/* symlinks are now owned by the npm
    // workspace install — the generator no longer recreates them (doing so
    // would clobber npm's correct member symlinks).

    const allSymlinks: string[] = []
    const allGenerated: string[] = []
    const packagesInfo: { packageName: string; manifest: PackageManifest; packageDir: string }[] =
        []

    // Symlink core's own pb_migrations/*.js into the app's MIGRATIONS_DIR so
    // PocketBase loads them alongside sibling-package migrations. Core is
    // treated specially here because it's a library, not a feature package,
    // so it doesn't have a manifest.ts that flows through the main loop.
    if (fs.existsSync(CORE_MIGRATIONS_SOURCE)) {
        for (const file of fs.readdirSync(CORE_MIGRATIONS_SOURCE)) {
            const src = path.join(CORE_MIGRATIONS_SOURCE, file)
            const dst = path.join(MIGRATIONS_DIR, file)
            replaceSymlink(src, dst)
            allSymlinks.push(dst)
        }
    }

    for (const packageName of pkgNames) {
        // Core is a library, not a feature package. It doesn't have a
        // manifest.ts and shouldn't flow through the per-package wiring.
        // Its migrations are symlinked in via the CORE_MIGRATIONS_SOURCE
        // pass above. Skip if a stale installed-packages.json or
        // packages/ entry tries to feed it through this loop.
        if (packageName === '@tinycld/core') continue

        const packageDir = resolvePackageDir(packageName)
        const manifest = loadManifest(packageDir)
        packagesInfo.push({ packageName, manifest, packageDir })

        // Generate routes
        const routeFiles = generateRoutes(packageName, manifest, packageDir)
        allGenerated.push(...routeFiles)

        const publicRouteFiles = generatePublicRoutes(packageName, manifest, packageDir)
        allGenerated.push(...publicRouteFiles)

        // Create symlinks for migrations and hooks
        const links = createSymlinks(manifest, packageDir)
        allSymlinks.push(...links)
    }

    detectPublicRouteConflicts(packagesInfo, APP_DIR)

    // Fail fast on conflicting `t <letter>` nav shortcuts so two installed
    // packages can't silently fight over the same binding.
    validateNavShortcuts(packagesInfo)

    // Collections wiring is no longer generated — it's derived at runtime from
    // tinycld.config.ts via buildPackageStores (see generate-config.ts +
    // core/lib/packages/derive-stores.ts).

    // The package registry is no longer generated — usePackages() derives the
    // static set from tinycld.config.ts via toStaticRegistry (see
    // core/lib/packages/static-registry.ts), then merges runtime-installed
    // packages from the DB.

    // Sidebars, providers, and settings panels are no longer generated — they
    // are derived at runtime from tinycld.config.ts via deriveSidebars /
    // deriveProviders / deriveSettings (core/lib/packages/derive-components.ts).

    // Generate help file. Core is included explicitly because it has no
    // manifest and doesn't flow through the per-package loop.
    const helpContributors: HelpContributor[] = []
    if (fs.existsSync(CORE_HELP_SOURCE)) {
        helpContributors.push({
            packageName: '@tinycld/core',
            pkgSlug: 'core',
            helpDir: CORE_HELP_SOURCE,
        })
    }
    for (const { manifest, packageDir } of packagesInfo) {
        if (!manifest.help?.directory) continue
        const helpDir = path.join(packageDir, manifest.help.directory)
        if (!fs.existsSync(helpDir)) continue
        helpContributors.push({
            packageName: manifest.name,
            pkgSlug: manifest.slug,
            helpDir,
        })
    }
    const helpFile = path.join(GENERATED_DIR, 'package-help.ts')
    fs.writeFileSync(helpFile, generateHelpFile(helpContributors))
    allGenerated.push(helpFile)

    // Generate seeds file
    const seedsFile = path.join(GENERATED_DIR, 'package-seeds.ts')
    fs.writeFileSync(seedsFile, generateSeedsFile(packagesInfo))
    allGenerated.push(seedsFile)

    // Generate Tailwind/Uniwind source-roots file. global.css imports this so
    // the scanner reaches each linked package's real on-disk source tree.
    const uniwindSourcesFile = path.join(GENERATED_DIR, 'uniwind-sources.css')
    fs.writeFileSync(uniwindSourcesFile, generateUniwindSourcesFile(packagesInfo))
    allGenerated.push(uniwindSourcesFile)

    // Generate Go server extension file
    const packageExtensionsFile = path.join(SERVER_DIR, 'package_extensions.go')
    fs.writeFileSync(packageExtensionsFile, generatePackageExtensionsGo(packagesInfo))
    allGenerated.push(packageExtensionsFile)

    // Generate bundled-packages.json for Go server seed
    const bundledPackages = packagesInfo.map(({ manifest }) => ({
        name: manifest.name,
        slug: manifest.slug,
        version: manifest.version,
        icon: manifest.nav?.icon ?? '',
        description: manifest.description ?? '',
        hasServer: !!manifest.server,
        navOrder: manifest.nav?.order ?? 0,
    }))
    const bundledPkgFile = path.join(SERVER_DIR, 'bundled-packages.json')
    fs.writeFileSync(bundledPkgFile, JSON.stringify(bundledPackages, null, 2))
    allGenerated.push(bundledPkgFile)

    // Wire linked sibling Go modules through go.work (gitignored). The
    // tracked server/go.mod stays lean — only the bundled core's replace
    // directive lives there.
    updateGoWork(packagesInfo)
    runGoWorkSync()

    // Save manifest for cleanup
    const linksManifest: LinksManifest = {
        symlinks: allSymlinks,
        generatedFiles: allGenerated,
    }
    fs.writeFileSync(LINKS_MANIFEST, JSON.stringify(linksManifest, null, 2))

    // Run each linked package's declared build script (e.g. text's
    // webview-editor bundle). Used by `npm run packages:generate`,
    // `prebuild:web`, and the dev startup path — all of which need the
    // artifacts on disk before Expo/Metro/CI bundling begins.
    await runPackageBuildsOnce(packagesInfo)
}

function isMainModule(): boolean {
    if ((import.meta as { main?: boolean }).main) return true
    if (!process.argv[1]) return false
    try {
        return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
    } catch {
        return false
    }
}

if (isMainModule()) {
    main()
}
