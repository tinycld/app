import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

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

// CORE_IMPORT_ALIAS is what generated TS files use to import core types
// (pbSchema, PackageManifest, CoreStores). In the tinycld app sibling,
// core is a linked package resolved via the `@tinycld/core` alias.
const CORE_IMPORT_ALIAS = process.env.TINYCLD_CORE_IMPORT_ALIAS ?? '@tinycld/core'

// CORE_MIGRATIONS_SOURCE points at core's own migrations so we can symlink
// them into the app server's pb_migrations/ alongside sibling migrations.
// Core isn't in the package registry (no manifest.ts), so its migrations
// aren't picked up by the per-package loop below; we handle them explicitly.
// Default: TINYCLD_CORE_MIGRATIONS_DIR env var, or the conventional sibling
// symlink location at packages/@tinycld/core/server/pb_migrations.
const CORE_MIGRATIONS_SOURCE = process.env.TINYCLD_CORE_MIGRATIONS_DIR
    ? path.resolve(process.env.TINYCLD_CORE_MIGRATIONS_DIR)
    : path.join(ROOT, 'packages/@tinycld/core/server/pb_migrations')

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

function resolvePackageDir(packageName: string): string {
    // Primary: packages/<name>, which is a symlink to the sibling repo.
    // Scoped packages live at packages/@scope/name (mirroring node_modules
    // layout). Unscoped packages live flat at packages/<name>.
    // Use realpathSync so downstream path operations produce stable absolute
    // paths and don't rely on the link.
    const packagesPath = path.join(ROOT, 'packages', packageName)
    if (fs.existsSync(packagesPath)) {
        return fs.realpathSync(packagesPath)
    }
    // Fallback for packages installed via npm into node_modules.
    const nodeModulesPath = path.join(ROOT, 'node_modules', packageName)
    if (fs.existsSync(nodeModulesPath)) {
        return fs.realpathSync(nodeModulesPath)
    }
    throw new Error(`Cannot resolve package directory for ${packageName}`)
}

function loadManifest(packageDir: string): PackageManifest {
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

function slugToPascal(slug: string): string {
    return slug
        .split('-')
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join('')
}

function generateCollectionsFile(
    packagesInfo: { packageName: string; manifest: PackageManifest }[]
): string {
    const withCollections = packagesInfo.filter(a => a.manifest.collections)

    if (withCollections.length === 0) {
        return [
            '// Auto-generated by scripts/generate-packages.ts — do not edit',
            `import type { Schema } from '${CORE_IMPORT_ALIAS}/types/pbSchema'`,
            "import type { createCollection } from 'pbtsdb/core'",
            `import type { CoreStores } from '${CORE_IMPORT_ALIAS}/lib/pocketbase'`,
            '',
            'export type MergedSchema = Schema',
            'type NewCollection = ReturnType<typeof createCollection<MergedSchema>>',
            '',
            'export function packageStores(_newCollection: NewCollection, _coreStores: CoreStores) {',
            '    return {}',
            '}',
            '',
        ].join('\n')
    }

    const schemaImports = withCollections.map(a => {
        const pascal = slugToPascal(a.manifest.slug)
        return `import type { ${pascal}Schema } from '${a.packageName}/${a.manifest.collections?.types}'`
    })

    const registerImports = withCollections.map(a => {
        const id = slugToIdentifier(a.manifest.slug)
        return `import { registerCollections as ${id}Register } from '${a.packageName}/${a.manifest.collections?.register}'`
    })

    const schemaUnion = withCollections
        .map(a => `${slugToPascal(a.manifest.slug)}Schema`)
        .join(' & ')

    const spreads = withCollections.map(a => {
        const id = slugToIdentifier(a.manifest.slug)
        return `        ...${id}Register(newCollection, coreStores),`
    })

    return [
        '// Auto-generated by scripts/generate-packages.ts — do not edit',
        `import type { Schema } from '${CORE_IMPORT_ALIAS}/types/pbSchema'`,
        "import type { createCollection } from 'pbtsdb/core'",
        `import type { CoreStores } from '${CORE_IMPORT_ALIAS}/lib/pocketbase'`,
        ...schemaImports,
        ...registerImports,
        '',
        `export type MergedSchema = Schema & ${schemaUnion}`,
        'type NewCollection = ReturnType<typeof createCollection<MergedSchema>>',
        '',
        'export function packageStores(newCollection: NewCollection, coreStores: CoreStores) {',
        '    return {',
        ...spreads,
        '    }',
        '}',
        '',
    ].join('\n')
}

function generateRegistryFile(
    packagesInfo: { packageName: string; manifest: PackageManifest }[]
): string {
    if (packagesInfo.length === 0) {
        return [
            '// Auto-generated by scripts/generate-packages.ts — do not edit',
            `import type { PackageManifest } from '${CORE_IMPORT_ALIAS}/lib/packages/types'`,
            '',
            'export const packageRegistry: (PackageManifest & { packageName: string })[] = []',
            '',
        ].join('\n')
    }

    const imports = packagesInfo.map(a => {
        const id = slugToIdentifier(a.manifest.slug)
        return `import ${id}Manifest from '${a.packageName}/manifest'`
    })

    const entries = packagesInfo.map(a => {
        const id = slugToIdentifier(a.manifest.slug)
        return `    { ...${id}Manifest, packageName: '${a.packageName}' },`
    })

    return [
        '// Auto-generated by scripts/generate-packages.ts — do not edit',
        `import type { PackageManifest } from '${CORE_IMPORT_ALIAS}/lib/packages/types'`,
        ...imports,
        '',
        'export const packageRegistry: (PackageManifest & { packageName: string })[] = [',
        ...entries,
        ']',
        '',
    ].join('\n')
}

function generateSidebarsFile(
    packagesInfo: { packageName: string; manifest: PackageManifest }[]
): string {
    const withSidebars = packagesInfo.filter(a => a.manifest.sidebar?.component)

    const imports = withSidebars.map(a => {
        const id = slugToIdentifier(a.manifest.slug)
        return `import ${id}Sidebar from '${a.packageName}/${a.manifest.sidebar?.component}'`
    })

    const entries = packagesInfo.map(a => {
        if (a.manifest.sidebar?.component) {
            const id = slugToIdentifier(a.manifest.slug)
            return `    '${a.manifest.slug}': ${id}Sidebar,`
        }
        return `    '${a.manifest.slug}': null,`
    })

    return [
        '// Auto-generated by scripts/generate-packages.ts — do not edit',
        "import type { ComponentType } from 'react'",
        ...imports,
        '',
        'interface PackageSidebarProps {',
        '    isCollapsed: boolean',
        '}',
        '',
        'export const packageSidebars: Record<string, ComponentType<PackageSidebarProps> | null> = {',
        ...entries,
        '}',
        '',
    ].join('\n')
}

function generateProvidersFile(
    packagesInfo: { packageName: string; manifest: PackageManifest }[]
): string {
    const withProviders = packagesInfo.filter(a => a.manifest.provider?.component)

    const imports = withProviders.map(a => {
        const id = slugToIdentifier(a.manifest.slug)
        return `import ${id}Provider from '${a.packageName}/${a.manifest.provider?.component}'`
    })

    const entries = packagesInfo.map(a => {
        if (a.manifest.provider?.component) {
            const id = slugToIdentifier(a.manifest.slug)
            return `    '${a.manifest.slug}': ${id}Provider,`
        }
        return `    '${a.manifest.slug}': null,`
    })

    return [
        '// Auto-generated by scripts/generate-packages.ts — do not edit',
        "import type { ComponentType, ReactNode } from 'react'",
        ...imports,
        '',
        'interface PackageProviderProps {',
        '    children: ReactNode',
        '}',
        '',
        'export const packageProviders: Record<string, ComponentType<PackageProviderProps> | null> = {',
        ...entries,
        '}',
        '',
    ].join('\n')
}

function generateSettingsFile(
    packagesInfo: { packageName: string; manifest: PackageManifest }[]
): string {
    const withSettings = packagesInfo.filter(
        a => a.manifest.settings && a.manifest.settings.length > 0
    )

    if (withSettings.length === 0) {
        return [
            '// Auto-generated by scripts/generate-packages.ts — do not edit',
            "import type { ComponentType } from 'react'",
            '',
            'export interface PackageSettingsPanel {',
            '    slug: string',
            '    label: string',
            '    Component: ComponentType',
            '}',
            '',
            'export interface PackageSettingsGroup {',
            '    packageName: string',
            '    pkgSlug: string',
            '    panels: PackageSettingsPanel[]',
            '}',
            '',
            'export const packageSettings: PackageSettingsGroup[] = []',
            '',
        ].join('\n')
    }

    const imports: string[] = []
    const groups: string[] = []

    for (const a of withSettings) {
        const panels: string[] = []
        for (const panel of a.manifest.settings ?? []) {
            const id = `${slugToIdentifier(a.manifest.slug)}${slugToPascal(panel.slug)}`
            imports.push(`import ${id} from '${a.packageName}/${panel.component}'`)
            panels.push(
                `            { slug: '${panel.slug}', label: '${panel.label}', Component: ${id} },`
            )
        }
        groups.push(
            [
                '    {',
                `        packageName: '${a.manifest.name}',`,
                `        pkgSlug: '${a.manifest.slug}',`,
                '        panels: [',
                ...panels,
                '        ],',
                '    },',
            ].join('\n')
        )
    }

    return [
        '// Auto-generated by scripts/generate-packages.ts — do not edit',
        "import type { ComponentType } from 'react'",
        ...imports,
        '',
        'export interface PackageSettingsPanel {',
        '    slug: string',
        '    label: string',
        '    Component: ComponentType',
        '}',
        '',
        'export interface PackageSettingsGroup {',
        '    packageName: string',
        '    pkgSlug: string',
        '    panels: PackageSettingsPanel[]',
        '}',
        '',
        'export const packageSettings: PackageSettingsGroup[] = [',
        ...groups,
        ']',
        '',
    ].join('\n')
}

function generateSeedsFile(
    packagesInfo: { packageName: string; manifest: PackageManifest }[]
): string {
    const withSeeds = packagesInfo.filter(a => a.manifest.seed?.script)

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

const GO_MOD_MARKER_START = '// --- package extensions (auto-generated, do not edit) ---'
const GO_MOD_MARKER_END = '// --- end package extensions ---'
const OLD_GO_MOD_MARKER_START = '// --- addon extensions (auto-generated, do not edit) ---'
const OLD_GO_MOD_MARKER_END = '// --- end addon extensions ---'

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

function updateGoMod(
    packagesInfo: { packageName: string; manifest: PackageManifest; packageDir: string }[]
) {
    const withServer = packagesInfo.filter(
        a =>
            a.manifest.server?.package &&
            fs.existsSync(path.join(a.packageDir, a.manifest.server.package))
    )

    const goModPath = path.join(SERVER_DIR, 'go.mod')
    let content = fs.readFileSync(goModPath, 'utf-8')

    // Strip existing block (new or old markers)
    for (const [start, end] of [
        [GO_MOD_MARKER_START, GO_MOD_MARKER_END],
        [OLD_GO_MOD_MARKER_START, OLD_GO_MOD_MARKER_END],
    ]) {
        const startIdx = content.indexOf(start)
        const endIdx = content.indexOf(end)
        if (startIdx !== -1 && endIdx !== -1) {
            content =
                content.slice(0, startIdx).trimEnd() +
                '\n' +
                content.slice(endIdx + end.length).trimStart()
        }
    }

    // Remove trailing whitespace/newlines and ensure single trailing newline
    content = `${content.trimEnd()}\n`

    if (withServer.length > 0) {
        const lines = [
            '',
            GO_MOD_MARKER_START,
            ...withServer.map(a => `require ${a.manifest.server?.module} v0.0.0`),
            '',
            ...withServer.map(a => {
                const relPath = path.relative(
                    SERVER_DIR,
                    path.join(a.packageDir, a.manifest.server?.package ?? '')
                )
                return `replace ${a.manifest.server?.module} => ${relPath}`
            }),
            GO_MOD_MARKER_END,
            '',
        ]
        content += lines.join('\n')
    }

    fs.writeFileSync(goModPath, content)
}

function runGoModTidy() {
    // Skip cleanly when go isn't installed at all (e.g. the Docker Node-only
    // build stage). Any other failure — bad go.mod, network issue, missing
    // dep — should surface to the developer instead of being swallowed.
    try {
        execSync('command -v go', { stdio: 'ignore' })
    } catch {
        return
    }

    try {
        execSync('go mod tidy', { cwd: SERVER_DIR, stdio: 'inherit' })
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`\ngenerate-packages: go mod tidy failed: ${msg}\n`)
        process.stderr.write(
            'generate-packages: continuing — go.mod may be in an inconsistent state\n'
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

    // Ensure ../core (parent of ROOT) is a symlink to packages/@tinycld/core/.
    // Feature sibling repos (mail, calendar, …) live next to tinycld/ and have
    // tsconfig paths like "@tinycld/core/*": ["../core/*"]. Their server
    // go.mod files have replace directives like
    // `replace tinycld.org/core => ../../core/server`. Both rely on a `core/`
    // entry in tinycld's parent directory. Create it on every generate so a
    // fresh clone Just Works the moment any sibling is checked out alongside.
    // Skipped if a real directory already lives there (don't clobber whatever
    // the user has).
    const PARENT_DIR = path.dirname(ROOT)
    const CORE_PARENT_LINK = path.join(PARENT_DIR, 'core')
    const CORE_PARENT_TARGET = path.join(path.basename(ROOT), 'packages', '@tinycld', 'core')
    try {
        const stat = fs.lstatSync(CORE_PARENT_LINK)
        if (stat.isSymbolicLink()) {
            if (fs.readlinkSync(CORE_PARENT_LINK) !== CORE_PARENT_TARGET) {
                fs.unlinkSync(CORE_PARENT_LINK)
                fs.symlinkSync(CORE_PARENT_TARGET, CORE_PARENT_LINK)
            }
        }
        // Real directory at ../core: leave it alone.
    } catch {
        // Doesn't exist yet — create the symlink.
        fs.symlinkSync(CORE_PARENT_TARGET, CORE_PARENT_LINK)
    }

    // Ensure node_modules/@tinycld symlinks exist so TypeScript's bundler
    // resolution can find package.json exports for linked sibling packages.
    // These may be wiped by `bun install`, so we recreate them on every generate.
    const NODE_MODULES_SCOPE = path.join(ROOT, 'node_modules/@tinycld')
    fs.mkdirSync(NODE_MODULES_SCOPE, { recursive: true })
    if (fs.existsSync(path.join(ROOT, 'packages/@tinycld'))) {
        for (const entry of fs.readdirSync(path.join(ROOT, 'packages/@tinycld'), {
            withFileTypes: true,
        })) {
            if (!entry.isSymbolicLink() && !entry.isDirectory()) continue
            const nmLink = path.join(NODE_MODULES_SCOPE, entry.name)
            const target = path.join('..', '..', 'packages', '@tinycld', entry.name)
            // bun materializes file: deps as a real directory (full of file
            // symlinks) at this path, so we can't assume a symlink. lstat to
            // tell what's there and replace whatever it is with our symlink.
            try {
                const stat = fs.lstatSync(nmLink)
                if (stat.isSymbolicLink()) {
                    if (fs.readlinkSync(nmLink) === target) continue
                    fs.unlinkSync(nmLink)
                } else if (stat.isDirectory()) {
                    fs.rmSync(nmLink, { recursive: true, force: true })
                } else {
                    fs.unlinkSync(nmLink)
                }
            } catch {
                // doesn't exist yet
            }
            fs.symlinkSync(target, nmLink)
        }
    }

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

    // Generate collection registration file
    const collectionsFile = path.join(GENERATED_DIR, 'package-collections.ts')
    fs.writeFileSync(collectionsFile, generateCollectionsFile(packagesInfo))
    allGenerated.push(collectionsFile)

    // Generate registry file
    const registryFile = path.join(GENERATED_DIR, 'package-registry.ts')
    fs.writeFileSync(registryFile, generateRegistryFile(packagesInfo))
    allGenerated.push(registryFile)

    // Generate sidebars file
    const sidebarsFile = path.join(GENERATED_DIR, 'package-sidebars.ts')
    fs.writeFileSync(sidebarsFile, generateSidebarsFile(packagesInfo))
    allGenerated.push(sidebarsFile)

    // Generate providers file
    const providersFile = path.join(GENERATED_DIR, 'package-providers.ts')
    fs.writeFileSync(providersFile, generateProvidersFile(packagesInfo))
    allGenerated.push(providersFile)

    // Generate settings file
    const settingsFile = path.join(GENERATED_DIR, 'package-settings.ts')
    fs.writeFileSync(settingsFile, generateSettingsFile(packagesInfo))
    allGenerated.push(settingsFile)

    // Generate seeds file
    const seedsFile = path.join(GENERATED_DIR, 'package-seeds.ts')
    fs.writeFileSync(seedsFile, generateSeedsFile(packagesInfo))
    allGenerated.push(seedsFile)

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

    // Update server/go.mod with package require/replace directives
    updateGoMod(packagesInfo)
    runGoModTidy()

    // Save manifest for cleanup
    const linksManifest: LinksManifest = {
        symlinks: allSymlinks,
        generatedFiles: allGenerated,
    }
    fs.writeFileSync(LINKS_MANIFEST, JSON.stringify(linksManifest, null, 2))
}

main()
