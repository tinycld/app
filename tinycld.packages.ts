import * as fs from 'node:fs'
import * as path from 'node:path'

// Feature packages are npm workspace members living as siblings of the app
// shell (one level up). @tinycld/core is bundled inside the shell at
// packages/@tinycld/core/. The set of linked packages = the workspace member
// dirs that carry a manifest.ts. TINYCLD_APP_ROOT overrides the app-shell root
// for tests that scan a fake tree.
const APP_ROOT = process.env.TINYCLD_APP_ROOT
    ? path.resolve(process.env.TINYCLD_APP_ROOT)
    : path.resolve(import.meta.dirname)
const WORKSPACE_ROOT = path.resolve(APP_ROOT, '..')
const CORE_NAME = '@tinycld/core'

let cached: string[] | null = null

/**
 * Returns the package names linked into the app. Bundled core (which has no
 * manifest.ts of its own) is always included when present; feature members are
 * sibling directories that contain a manifest.ts and declare an `@scope/name`
 * (or bare) package name in their package.json. Result is cached per process.
 */
export function getPackages(): string[] {
    if (cached) return cached

    const result: string[] = []

    // Bundled core (real dir inside the shell, no manifest.ts).
    if (fs.existsSync(path.join(APP_ROOT, 'packages', '@tinycld', 'core', 'package.json'))) {
        result.push(CORE_NAME)
    }

    // Feature members: sibling dirs with a manifest.ts + a named package.json.
    if (fs.existsSync(WORKSPACE_ROOT)) {
        for (const entry of fs.readdirSync(WORKSPACE_ROOT)) {
            const dir = path.join(WORKSPACE_ROOT, entry)
            if (!isDir(dir)) continue
            if (!hasManifest(dir)) continue
            const pkgJsonPath = path.join(dir, 'package.json')
            if (!fs.existsSync(pkgJsonPath)) continue
            try {
                const name = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')).name
                if (typeof name === 'string' && name.length > 0 && name !== CORE_NAME) {
                    result.push(name)
                }
            } catch {
                // unreadable package.json — skip
            }
        }
    }

    cached = result
    return result
}

function hasManifest(dir: string): boolean {
    return (
        fs.existsSync(path.join(dir, 'manifest.ts')) || fs.existsSync(path.join(dir, 'manifest.js'))
    )
}

function isDir(p: string): boolean {
    try {
        return fs.statSync(p).isDirectory()
    } catch {
        return false
    }
}
