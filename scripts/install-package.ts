import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { linkPackage } from './link-package'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(__filename), '..')

// Bun exposes `import.meta.main`, but tsx (running on Node) does not, so we
// fall back to comparing argv[1] with this file's resolved path. realpath on
// both sides handles macOS /private/tmp vs /tmp and any symlinked launchers.
function isMainModule(): boolean {
    if ((import.meta as { main?: boolean }).main) return true
    if (!process.argv[1]) return false
    try {
        return fs.realpathSync(process.argv[1]) === fs.realpathSync(__filename)
    } catch {
        return false
    }
}

export interface InstallArgs {
    url: string
    overridePath?: string
    ref?: string
    shallow?: boolean
}

/**
 * Extract a default directory name from a git URL. This is only used to
 * pick where to clone when `--path` isn't given — the package's actual
 * identity comes from `package.json` after cloning.
 *
 * Examples:
 *   https://github.com/tinycld/contacts        → contacts
 *   https://github.com/tinycld/contacts.git    → contacts
 *   git@github.com:tinycld/contacts.git        → contacts
 *   https://example.com/path/to/my-pkg.git     → my-pkg
 */
export function deriveDirNameFromUrl(url: string): string {
    const trimmed = url.replace(/\.git$/, '').replace(/\/$/, '')
    const lastSlash = trimmed.lastIndexOf('/')
    const lastColon = trimmed.lastIndexOf(':')
    const sep = Math.max(lastSlash, lastColon)
    const name = sep === -1 ? trimmed : trimmed.slice(sep + 1)
    if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
        throw new Error(`Could not derive a directory name from URL: ${url}`)
    }
    return name
}

export function parseInstallFlags(rest: string[]): {
    overridePath?: string
    ref?: string
    shallow?: boolean
} {
    let overridePath: string | undefined
    let ref: string | undefined
    let shallow: boolean | undefined
    for (let i = 0; i < rest.length; i++) {
        const arg = rest[i]
        if (arg === '--path' || arg === '-p') {
            overridePath = rest[++i]
            if (!overridePath) throw new Error('--path requires a value')
        } else if (arg === '--ref' || arg === '-r') {
            ref = rest[++i]
            if (!ref) throw new Error('--ref requires a value')
        } else if (arg === '--full' || arg === '--no-shallow') {
            shallow = false
        } else if (arg === '--shallow') {
            shallow = true
        } else {
            throw new Error(`Unknown argument: ${arg}`)
        }
    }
    return { overridePath, ref, shallow }
}

function runGit(args: string[], cwd?: string): void {
    execSync(`git ${args.map(a => quoteArg(a)).join(' ')}`, {
        cwd,
        stdio: 'inherit',
    })
}

function quoteArg(s: string): string {
    return /[\s"'$`\\]/.test(s) ? `'${s.replace(/'/g, `'\\''`)}'` : s
}

function readPackageJson(dir: string): { name?: string } {
    const p = path.join(dir, 'package.json')
    return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function requireValidName(pkg: { name?: string }, where: string): string {
    if (!pkg.name || typeof pkg.name !== 'string') {
        throw new Error(`package.json at ${where} is missing a "name" field`)
    }
    return pkg.name
}

export function installPackage({ url, overridePath, ref, shallow = true }: InstallArgs): void {
    const dirName = deriveDirNameFromUrl(url)
    const targetDir = overridePath
        ? path.resolve(ROOT, overridePath)
        : path.resolve(ROOT, '..', dirName)
    const relTargetDir = path.relative(ROOT, targetDir)

    if (fs.existsSync(targetDir)) {
        if (!fs.existsSync(path.join(targetDir, '.git'))) {
            throw new Error(
                `Target directory exists but isn't a git repo: ${targetDir}\n` +
                    `Move it out of the way or pass --path <other-dir>.`
            )
        }
        const existingName = requireValidName(readPackageJson(targetDir), targetDir)
        console.log(`Target ${targetDir} already exists as ${existingName}. Skipping clone.`)
        if (ref) {
            console.log(`Checking out ${ref}...`)
            runGit(['fetch', 'origin'], targetDir)
            runGit(['checkout', ref], targetDir)
        }
        linkPackage(relTargetDir)
        return
    }

    const detail = [ref && `ref: ${ref}`, shallow && 'shallow'].filter(Boolean).join(', ')
    console.log(`Cloning ${url} → ${targetDir}${detail ? ` (${detail})` : ''}...`)
    const cloneArgs = ['clone']
    if (shallow) cloneArgs.push('--depth=1', '--single-branch')
    if (ref) cloneArgs.push('--branch', ref)
    cloneArgs.push(url, targetDir)
    runGit(cloneArgs)

    requireValidName(readPackageJson(targetDir), targetDir)
    linkPackage(relTargetDir)
}

if (isMainModule()) {
    const [url, ...rest] = process.argv.slice(2)

    if (!url) {
        console.error(
            'Usage: bun run packages:install <git-url> [--path <dir>] [--ref <branch|tag|sha>] [--full]'
        )
        process.exit(2)
    }

    try {
        const flags = parseInstallFlags(rest)
        installPackage({ url, ...flags })
    } catch (err) {
        console.error((err as Error).message ?? err)
        process.exit(1)
    }
}
