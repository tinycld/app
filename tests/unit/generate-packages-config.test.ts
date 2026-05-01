import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * Smoke tests for the generator's env-var overrides. The upcoming core/app
 * split retargets the generator at a sibling repo — these tests prove the
 * mechanism works without actually moving anything.
 */

const GEN_SCRIPT = path.resolve(__dirname, '../../scripts/generate-packages.ts')

function setupAppRoot(root: string): void {
    fs.mkdirSync(path.join(root, 'packages'), { recursive: true })
    fs.mkdirSync(path.join(root, 'server'), { recursive: true })
    fs.mkdirSync(path.join(root, 'server/pb_migrations'), { recursive: true })
    fs.mkdirSync(path.join(root, 'lib/generated'), { recursive: true })
    fs.mkdirSync(path.join(root, 'app/a/[orgSlug]'), { recursive: true })

    // Minimal go.mod so the generator's updateGoMod has something to write into.
    fs.writeFileSync(
        path.join(root, 'server/go.mod'),
        'module tinycld.org/app\n\ngo 1.25.0\n\nrequire github.com/pocketbase/pocketbase v0.36.8\n'
    )

    // Create a fake tinycld.packages.ts-like scan root. The real generator
    // imports `../tinycld.packages.ts` relative to its own location, so this
    // env-var test runs the generator in-tree but redirects outputs.
    // With TINYCLD_APP_ROOT set to a temp dir whose packages/ is empty,
    // the generator produces the "zero packages" output set.
}

describe('generate-packages env overrides', () => {
    let tmp: string

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-pkgs-cfg-'))
        setupAppRoot(tmp)
    })

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true })
    })

    it('writes generated TS files under TINYCLD_GENERATED_DIR', () => {
        execFileSync('bunx', ['tsx', GEN_SCRIPT], {
            env: {
                ...process.env,
                TINYCLD_APP_ROOT: tmp,
                TINYCLD_GENERATED_DIR: path.join(tmp, 'lib/generated'),
                TINYCLD_APP_DIR: path.join(tmp, 'app'),
                TINYCLD_SERVER_DIR: path.join(tmp, 'server'),
            },
            stdio: 'pipe',
        })

        const registry = path.join(tmp, 'lib/generated/package-registry.ts')
        expect(fs.existsSync(registry)).toBe(true)
    })

    it('honors TINYCLD_CORE_IMPORT_ALIAS in generated file contents', () => {
        execFileSync('bunx', ['tsx', GEN_SCRIPT], {
            env: {
                ...process.env,
                TINYCLD_APP_ROOT: tmp,
                TINYCLD_GENERATED_DIR: path.join(tmp, 'lib/generated'),
                TINYCLD_APP_DIR: path.join(tmp, 'app'),
                TINYCLD_SERVER_DIR: path.join(tmp, 'server'),
                TINYCLD_CORE_IMPORT_ALIAS: '@tinycld/core',
            },
            stdio: 'pipe',
        })

        const registry = fs.readFileSync(
            path.join(tmp, 'lib/generated/package-registry.ts'),
            'utf8'
        )
        expect(registry).toContain("from '@tinycld/core/lib/packages/types'")
        expect(registry).not.toContain('~/tinycld/core')
    })

    it('writes lib/generated/uniwind-sources.css with @source per linked package', () => {
        // Stand up a fake linked package so the generator emits a real source line.
        const pkgDir = path.join(tmp, 'packages/@acme/widget')
        fs.mkdirSync(pkgDir, { recursive: true })
        fs.writeFileSync(
            path.join(pkgDir, 'package.json'),
            JSON.stringify({ name: '@acme/widget', exports: { './manifest': './manifest.ts' } })
        )
        fs.writeFileSync(
            path.join(pkgDir, 'manifest.ts'),
            "export default { name: 'Widget', slug: 'widget', version: '0.1.0', description: 'x' }\n"
        )

        execFileSync('bunx', ['tsx', GEN_SCRIPT], {
            env: {
                ...process.env,
                TINYCLD_APP_ROOT: tmp,
                TINYCLD_GENERATED_DIR: path.join(tmp, 'lib/generated'),
                TINYCLD_APP_DIR: path.join(tmp, 'app'),
                TINYCLD_SERVER_DIR: path.join(tmp, 'server'),
            },
            stdio: 'pipe',
        })

        const sources = path.join(tmp, 'lib/generated/uniwind-sources.css')
        expect(fs.existsSync(sources)).toBe(true)
        const content = fs.readFileSync(sources, 'utf8')
        // Resolve the temp dir's real path: macOS /tmp is a symlink to /private/tmp,
        // and the generator uses realpathSync so emitted paths are real-resolved too.
        const expectedPkgDir = fs.realpathSync(pkgDir)
        expect(content).toContain(`@source "${expectedPkgDir}";`)
        expect(content).toContain('/* @acme/widget */')
    })

    it('writes go.mod + package_extensions.go under TINYCLD_SERVER_DIR', () => {
        execFileSync('bunx', ['tsx', GEN_SCRIPT], {
            env: {
                ...process.env,
                TINYCLD_APP_ROOT: tmp,
                TINYCLD_GENERATED_DIR: path.join(tmp, 'lib/generated'),
                TINYCLD_APP_DIR: path.join(tmp, 'app'),
                TINYCLD_SERVER_DIR: path.join(tmp, 'server'),
            },
            stdio: 'pipe',
        })

        const ext = path.join(tmp, 'server/package_extensions.go')
        expect(fs.existsSync(ext)).toBe(true)
        const content = fs.readFileSync(ext, 'utf8')
        expect(content).toContain('func registerPackageExtensions')
    })
})
