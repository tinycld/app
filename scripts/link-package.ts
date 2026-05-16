import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPackages } from '../tinycld.packages'
import { loadManifest, resolvePackageDir } from './generate-packages'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(__filename), '..')
const PACKAGES_DIR = path.join(ROOT, 'packages')

function isMainModule(): boolean {
    if ((import.meta as { main?: boolean }).main) return true
    if (!process.argv[1]) return false
    try {
        return fs.realpathSync(process.argv[1]) === fs.realpathSync(__filename)
    } catch {
        return false
    }
}

/**
 * A package name may be scoped (`@scope/name`) or unscoped (`name`).
 * The corresponding symlink path inside `packages/` mirrors npm's
 * node_modules layout: scoped packages nest under a scope directory.
 */
export function packageLinkPath(packageName: string): string {
    return path.join(PACKAGES_DIR, packageName)
}

/**
 * Resolve a sibling-locator CLI arg to an absolute directory.
 *
 *   - `contacts`         → ../contacts (relative to core root)
 *   - `../contacts`      → ../contacts (same, explicit)
 *   - `/abs/path/to/pkg` → used as-is
 *
 * Scoped names like `@acme/foo` are NOT accepted here — identity comes
 * from the sibling's package.json, not from the CLI.
 */
export function resolveSiblingDir(coreRoot: string, locator: string): string {
    if (locator.startsWith('@')) {
        throw new Error(
            `link-package expects a sibling directory, not a package name: "${locator}".\n` +
                `Pass a bare slug (e.g. "contacts") or a path (e.g. "../contacts"). The package name is read from the sibling's package.json.`
        )
    }
    if (locator.includes('/') || path.isAbsolute(locator)) {
        return path.resolve(coreRoot, locator)
    }
    return path.resolve(coreRoot, '..', locator)
}

export interface SiblingPackage {
    dir: string
    name: string
}

/**
 * Validates that `dir` looks like a sibling package and returns its
 * canonical name (from package.json). Throws if the directory is
 * missing, lacks a package.json with a string `name`, or lacks a
 * manifest.ts.
 */
export function readSiblingPackage(dir: string): SiblingPackage {
    if (!fs.existsSync(dir)) {
        throw new Error(`Sibling package directory not found: ${dir}`)
    }
    const pkgJsonPath = path.join(dir, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) {
        throw new Error(`No package.json in ${dir}`)
    }
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    if (typeof pkg.name !== 'string' || pkg.name.length === 0) {
        throw new Error(`package.json at ${dir} is missing a "name" field`)
    }
    if (!fs.existsSync(path.join(dir, 'manifest.ts'))) {
        throw new Error(`No manifest.ts in ${dir}`)
    }
    return { dir, name: pkg.name }
}

function removeLink(packageName: string): boolean {
    const target = packageLinkPath(packageName)
    let removed = false
    try {
        const st = fs.lstatSync(target)
        if (st.isSymbolicLink()) {
            fs.unlinkSync(target)
            removed = true
        } else {
            throw new Error(
                `Refusing to remove ${target} — it's a real directory, not a symlink. Move it out of the way first.`
            )
        }
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }

    // Also clean up an empty scope directory (e.g. packages/@acme/) if it
    // has no other links inside.
    const scope = path.dirname(target)
    if (scope !== PACKAGES_DIR) {
        try {
            const entries = fs.readdirSync(scope)
            if (entries.length === 0) fs.rmdirSync(scope)
        } catch {
            // not present
        }
    }

    return removed
}

/**
 * Given a manifest slug (e.g. "calc"), find every linked package whose
 * manifest.slug matches. Returns the full package names (e.g.
 * "@tinycld/calc"). Reads each linked package's manifest.ts so the match
 * is authoritative — the symlink basename is not relied on.
 */
function findLinksBySlug(slug: string): string[] {
    const matches: string[] = []
    for (const packageName of getPackages()) {
        if (packageName === '@tinycld/core') continue
        try {
            const manifest = loadManifest(resolvePackageDir(packageName))
            if (manifest.slug === slug) matches.push(packageName)
        } catch {
            // Skip packages whose manifest can't be read — they wouldn't
            // be wired in by the generator either.
        }
    }
    return matches
}

/**
 * Link a sibling package into core by locating it on disk. The
 * canonical package name comes from the sibling's package.json — the
 * CLI never invents a scope.
 */
export function linkPackage(locator: string): void {
    const siblingDir = resolveSiblingDir(ROOT, locator)
    const pkg = readSiblingPackage(siblingDir)

    removeLink(pkg.name)

    const linkPath = packageLinkPath(pkg.name)
    fs.mkdirSync(path.dirname(linkPath), { recursive: true })

    const linkTarget = path.relative(path.dirname(linkPath), siblingDir)
    fs.symlinkSync(linkTarget, linkPath)

    execGenerate()

    const relLink = path.relative(ROOT, linkPath)
    console.log(`Linked ${pkg.name} → ${relLink} (${linkTarget}).`)
}

/**
 * Unlink a package by either its full package name (`@tinycld/calc`,
 * `bare-name`) or its manifest slug (`calc`). Throws if no matching link
 * exists, or if a slug matches multiple linked packages.
 */
export function unlinkPackage(arg: string): void {
    const looksLikePackageName = arg.includes('/') || arg.startsWith('@')
    const targets = looksLikePackageName ? [arg] : findLinksBySlug(arg)

    if (targets.length === 0) {
        throw new Error(
            `No linked package with slug "${arg}" found.\n` +
                `Pass either a slug (e.g. "calc") or a full package name (e.g. "@tinycld/calc").`
        )
    }
    if (targets.length > 1) {
        throw new Error(
            `Slug "${arg}" matches multiple linked packages: ${targets.join(', ')}.\n` +
                `Pass the full package name to disambiguate.`
        )
    }

    const [packageName] = targets
    const removed = removeLink(packageName)
    if (!removed) {
        throw new Error(`No linked package named "${packageName}" found in ${PACKAGES_DIR}.`)
    }
    execGenerate()
    console.log(`Unlinked ${packageName}.`)
}

function execGenerate(): void {
    execSync('npm run packages:generate', { cwd: ROOT, stdio: 'inherit' })
}

if (isMainModule()) {
    const [mode, arg] = process.argv.slice(2)

    if (!mode || !arg || (mode !== 'link' && mode !== 'unlink')) {
        console.error(
            'Usage: tsx scripts/link-package.ts <link|unlink> <arg>\n' +
                '       link <sibling-dir>: the sibling package directory.\n' +
                '             Accepts a bare slug ("contacts" → ../contacts),\n' +
                '             a relative path ("../contacts"), or an absolute path.\n' +
                '             The package name is read from <sibling-dir>/package.json.\n' +
                '       unlink <slug-or-package-name>: the package to remove.\n' +
                '             Accepts either a manifest slug ("calc") or the\n' +
                '             full package name ("@tinycld/calc" / "bare-name").'
        )
        process.exit(2)
    }

    if (mode === 'link') {
        linkPackage(arg)
    } else {
        unlinkPackage(arg)
    }
}
