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

    // Minimal go.mod so the generator (and any go work sync it triggers when
    // siblings are linked) has a real module to operate against.
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
        execFileSync('npx', ['tsx', GEN_SCRIPT], {
            env: {
                ...process.env,
                TINYCLD_APP_ROOT: tmp,
                TINYCLD_GENERATED_DIR: path.join(tmp, 'lib/generated'),
                TINYCLD_APP_DIR: path.join(tmp, 'app'),
                TINYCLD_SERVER_DIR: path.join(tmp, 'server'),
            },
            stdio: 'pipe',
        })

        // package-help.ts is always written by the generator (survives the
        // Phase 3 teardown; collections/registry are now runtime-derived).
        const help = path.join(tmp, 'lib/generated/package-help.ts')
        expect(fs.existsSync(help)).toBe(true)
    })

    it('writes lib/generated/uniwind-sources.css with @source per linked package', () => {
        // Workspace model: a linked feature package is a SIBLING of the app
        // shell, discovered by getPackages() scanning the workspace root
        // (APP_ROOT/..). Build an isolated workspace: <ws>/app is the shell
        // (APP_ROOT), <ws>/widget is the sibling. This avoids scanning the
        // shared OS tmpdir for stray manifests from other tests.
        const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-pkgs-ws-'))
        const appRoot = path.join(ws, 'app')
        setupAppRoot(appRoot)

        const pkgDir = path.join(ws, 'widget')
        fs.mkdirSync(pkgDir, { recursive: true })
        fs.writeFileSync(
            path.join(pkgDir, 'package.json'),
            JSON.stringify({ name: '@acme/widget', exports: { './manifest': './manifest.ts' } })
        )
        fs.writeFileSync(
            path.join(pkgDir, 'manifest.ts'),
            "export default { name: 'Widget', slug: 'widget', version: '0.1.0', description: 'x' }\n"
        )
        // node_modules/@acme/widget symlink so resolvePackageDir (which prefers
        // node_modules) resolves the sibling.
        const nmScope = path.join(appRoot, 'node_modules/@acme')
        fs.mkdirSync(nmScope, { recursive: true })
        fs.symlinkSync(pkgDir, path.join(nmScope, 'widget'))

        try {
            execFileSync('npx', ['tsx', GEN_SCRIPT], {
                env: {
                    ...process.env,
                    TINYCLD_APP_ROOT: appRoot,
                    TINYCLD_GENERATED_DIR: path.join(appRoot, 'lib/generated'),
                    TINYCLD_APP_DIR: path.join(appRoot, 'app'),
                    TINYCLD_SERVER_DIR: path.join(appRoot, 'server'),
                },
                stdio: 'pipe',
            })

            const sources = path.join(appRoot, 'lib/generated/uniwind-sources.css')
            expect(fs.existsSync(sources)).toBe(true)
            const content = fs.readFileSync(sources, 'utf8')
            // macOS /tmp → /private/tmp symlink; generator realpath-resolves emitted paths.
            const expectedPkgDir = fs.realpathSync(pkgDir)
            expect(content).toContain(`@source "${expectedPkgDir}";`)
            expect(content).toContain('/* @acme/widget */')
        } finally {
            fs.rmSync(ws, { recursive: true, force: true })
        }
    })

    it('writes go.mod + package_extensions.go under TINYCLD_SERVER_DIR', () => {
        execFileSync('npx', ['tsx', GEN_SCRIPT], {
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
