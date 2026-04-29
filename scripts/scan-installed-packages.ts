import * as fs from 'node:fs'
import * as path from 'node:path'

export interface InstalledPackage {
    name: string
    dir: string
}

/**
 * Scan a directory (typically `node_modules/`) for installed tinycld packages.
 * A directory qualifies when its package.json declares a `tinycld` field
 * (boolean true or object) or contains a sibling `manifest.ts`. Recurses one
 * level into `@scope/` directories. Skips dotfile entries and broken
 * symlinks. Returns `[]` when the directory doesn't exist.
 */
export function scanInstalledPackages(rootDir: string): InstalledPackage[] {
    if (!isDir(rootDir)) return []

    const result: InstalledPackage[] = []

    for (const entry of readdirSafe(rootDir)) {
        if (entry.startsWith('.')) continue
        const entryPath = path.join(rootDir, entry)

        if (entry.startsWith('@')) {
            if (!isDir(entryPath)) continue
            for (const sub of readdirSafe(entryPath)) {
                if (sub.startsWith('.')) continue
                const subPath = path.join(entryPath, sub)
                const pkg = readPackage(subPath)
                if (pkg) result.push(pkg)
            }
        } else {
            const pkg = readPackage(entryPath)
            if (pkg) result.push(pkg)
        }
    }

    return result
}

function readPackage(dir: string): InstalledPackage | null {
    if (!isDir(dir)) return null
    const pkgJsonPath = path.join(dir, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) return null

    let pkg: { name?: string; tinycld?: unknown }
    try {
        pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    } catch {
        return null
    }

    const qualifies =
        pkg.tinycld === true ||
        (typeof pkg.tinycld === 'object' && pkg.tinycld !== null) ||
        fs.existsSync(path.join(dir, 'manifest.ts'))

    if (!qualifies) return null
    if (typeof pkg.name !== 'string') return null

    return { name: pkg.name, dir }
}

function readdirSafe(dir: string): string[] {
    try {
        return fs.readdirSync(dir)
    } catch {
        return []
    }
}

function isDir(p: string): boolean {
    try {
        return fs.statSync(p).isDirectory()
    } catch {
        return false
    }
}
