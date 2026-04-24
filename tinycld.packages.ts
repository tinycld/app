import * as fs from 'node:fs'
import * as path from 'node:path'

// Packages live under <app-root>/packages/. Default: the directory holding
// this file (the tinycld app sibling). TINYCLD_APP_ROOT overrides that for
// tests that scan a fake packages/ tree.
const PACKAGES_DIR = process.env.TINYCLD_APP_ROOT
    ? path.join(path.resolve(process.env.TINYCLD_APP_ROOT), 'packages')
    : path.resolve(import.meta.dirname, 'packages')

let cached: string[] | null = null

/**
 * Scans packages/ for directories containing a manifest.ts (or manifest.js).
 * Handles scoped (@scope/name) and unscoped layouts. Result is cached at
 * module level so repeated calls in the same process are free.
 */
export function getPackages(): string[] {
    if (cached) return cached

    const result: string[] = []

    if (!fs.existsSync(PACKAGES_DIR)) {
        cached = result
        return result
    }

    for (const entry of fs.readdirSync(PACKAGES_DIR)) {
        const entryPath = path.join(PACKAGES_DIR, entry)

        if (entry.startsWith('@')) {
            // Scoped: look one level deeper
            if (!isDir(entryPath)) continue
            for (const sub of fs.readdirSync(entryPath)) {
                const subPath = path.join(entryPath, sub)
                if (hasManifest(subPath)) {
                    result.push(`${entry}/${sub}`)
                }
            }
        } else if (hasManifest(entryPath)) {
            result.push(entry)
        }
    }

    cached = result
    return result
}

function hasManifest(dir: string): boolean {
    if (!isDir(dir)) return false
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
