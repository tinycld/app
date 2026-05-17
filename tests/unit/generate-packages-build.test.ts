import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runPackageBuilds } from '../../scripts/generate-packages'

describe('runPackageBuilds', () => {
    let tmp: string

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-build-'))
    })

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true })
    })

    function makePackage(slug: string, scriptBody: string, scriptName = 'build') {
        const pkgDir = path.join(tmp, slug)
        fs.mkdirSync(pkgDir, { recursive: true })
        fs.writeFileSync(
            path.join(pkgDir, 'package.json'),
            JSON.stringify({ name: `@test/${slug}`, version: '0.0.0', type: 'module' })
        )
        fs.writeFileSync(path.join(pkgDir, `${scriptName}.ts`), scriptBody)
        return pkgDir
    }

    it('returns an empty list when no package declares a build script', () => {
        const result = runPackageBuilds(
            [
                {
                    packageName: '@test/plain',
                    packageDir: tmp,
                    manifest: { name: 'Plain', slug: 'plain', version: '0', description: '' },
                },
            ],
            { mode: 'build', watch: false }
        )
        expect(result).toEqual([])
    })

    it('spawns the build script and resolves when it exits cleanly', async () => {
        const marker = path.join(tmp, 'marker.txt')
        const pkgDir = makePackage(
            'ok',
            `import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(marker)}, process.env.TINYCLD_BUILD_MODE ?? '')
`
        )
        const running = runPackageBuilds(
            [
                {
                    packageName: '@test/ok',
                    packageDir: pkgDir,
                    manifest: {
                        name: 'Ok',
                        slug: 'ok',
                        version: '0',
                        description: '',
                        build: { script: 'build' },
                    },
                },
            ],
            { mode: 'build', watch: false }
        )
        expect(running).toHaveLength(1)
        await running[0].exited
        expect(fs.readFileSync(marker, 'utf8')).toBe('build')
    })

    it('propagates a non-zero exit code as a rejection', async () => {
        const pkgDir = makePackage('fail', 'process.exit(7)')
        const running = runPackageBuilds(
            [
                {
                    packageName: '@test/fail',
                    packageDir: pkgDir,
                    manifest: {
                        name: 'Fail',
                        slug: 'fail',
                        version: '0',
                        description: '',
                        build: { script: 'build' },
                    },
                },
            ],
            { mode: 'build', watch: false }
        )
        await expect(running[0].exited).rejects.toThrow(/code 7/)
    })

    it('throws when the declared build script does not exist on disk', () => {
        const pkgDir = path.join(tmp, 'nobuild')
        fs.mkdirSync(pkgDir)
        fs.writeFileSync(
            path.join(pkgDir, 'package.json'),
            JSON.stringify({ name: '@test/nobuild', version: '0.0.0' })
        )
        expect(() =>
            runPackageBuilds(
                [
                    {
                        packageName: '@test/nobuild',
                        packageDir: pkgDir,
                        manifest: {
                            name: 'NoBuild',
                            slug: 'nobuild',
                            version: '0',
                            description: '',
                            build: { script: 'missing' },
                        },
                    },
                ],
                { mode: 'build', watch: false }
            )
        ).toThrow(/missing/)
    })

    it('passes watch flag and mode via env to the child', async () => {
        const out = path.join(tmp, 'env.json')
        const pkgDir = makePackage(
            'env',
            `import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(out)}, JSON.stringify({
    mode: process.env.TINYCLD_BUILD_MODE,
    watch: process.env.TINYCLD_BUILD_WATCH,
    slug: process.env.TINYCLD_PACKAGE_SLUG,
    pkgDir: process.env.TINYCLD_PACKAGE_DIR,
}))
`
        )
        const running = runPackageBuilds(
            [
                {
                    packageName: '@test/env',
                    packageDir: pkgDir,
                    manifest: {
                        name: 'Env',
                        slug: 'env',
                        version: '0',
                        description: '',
                        build: { script: 'build' },
                    },
                },
            ],
            { mode: 'dev', watch: true }
        )
        await running[0].exited
        const parsed = JSON.parse(fs.readFileSync(out, 'utf8'))
        expect(parsed.mode).toBe('dev')
        expect(parsed.watch).toBe('1')
        expect(parsed.slug).toBe('env')
        expect(parsed.pkgDir).toBe(pkgDir)
    })
})
