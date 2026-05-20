import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getPackages } from '../../tinycld.packages'

describe('getPackages (workspace members)', () => {
    it('returns @tinycld feature members that have a manifest, plus core', () => {
        const pkgs = getPackages()
        // bundled core is always present
        expect(pkgs).toContain('@tinycld/core')
        // known feature members resolve (they are linked workspace siblings)
        expect(pkgs).toContain('@tinycld/contacts')
        expect(pkgs).toContain('@tinycld/mail')
        // every returned entry is a non-empty package name
        for (const name of pkgs) {
            expect(typeof name).toBe('string')
            expect(name.length).toBeGreaterThan(0)
        }
    })
})

// Regression test for the CI layout: the workspace root is the PARENT of the
// app shell (shell at <ws>/tinycld, feature siblings at <ws>/<slug>), and there
// are NO node_modules/@tinycld symlinks under the app shell — npm hoisted them
// to <ws>/node_modules. resolvePackageDir must still resolve a feature package
// via its sibling directory. (This is the exact case that broke CI on the first
// post-merge run: "Cannot resolve package directory for @tinycld/drive".)
describe('resolvePackageDir (CI workspace-root-is-parent layout)', () => {
    it('resolves a feature sibling with no node_modules symlink', () => {
        const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-layout-'))
        try {
            const appRoot = path.join(ws, 'tinycld')
            fs.mkdirSync(path.join(appRoot, 'packages/@tinycld/core'), { recursive: true })
            fs.writeFileSync(
                path.join(appRoot, 'packages/@tinycld/core/package.json'),
                JSON.stringify({ name: '@tinycld/core' })
            )
            const driveDir = path.join(ws, 'drive')
            fs.mkdirSync(driveDir, { recursive: true })
            fs.writeFileSync(
                path.join(driveDir, 'package.json'),
                JSON.stringify({ name: '@tinycld/drive' })
            )
            fs.writeFileSync(
                path.join(driveDir, 'manifest.ts'),
                "export default { name: 'Drive', slug: 'drive', version: '0', description: 'x' }\n"
            )

            // Run a tsx probe (written to a temp file — `tsx -e` can't do
            // top-level await) with TINYCLD_APP_ROOT pointed at the shell,
            // importing the real getPackages + resolvePackageDir. A subprocess
            // avoids the module-level getPackages cache from the suite above.
            const tinycldPackagesPath = path.resolve(__dirname, '../../tinycld.packages.ts')
            const generatePath = path.resolve(__dirname, '../generate-packages.ts')
            const probePath = path.join(ws, 'probe.mts')
            fs.writeFileSync(
                probePath,
                [
                    `import { getPackages } from ${JSON.stringify(tinycldPackagesPath)}`,
                    `import { resolvePackageDir } from ${JSON.stringify(generatePath)}`,
                    'const out = getPackages().map((p) => `${p}=${resolvePackageDir(p)}`)',
                    'console.log(JSON.stringify(out))',
                ].join('\n')
            )
            const result = execFileSync('npx', ['tsx', probePath], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, TINYCLD_APP_ROOT: appRoot },
            })
            const resolved: string[] = JSON.parse(result.trim().split('\n').pop() as string)
            const driveEntry = resolved.find(r => r.startsWith('@tinycld/drive='))
            expect(driveEntry).toBeDefined()
            // resolves to the sibling dir (realpath), not a node_modules symlink
            expect(driveEntry).toContain('/drive')
            const coreEntry = resolved.find(r => r.startsWith('@tinycld/core='))
            expect(coreEntry).toContain('packages/@tinycld/core')
        } finally {
            fs.rmSync(ws, { recursive: true, force: true })
        }
    })
})
