import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectPublicRouteConflicts, generatePublicRoutesAt } from '../../scripts/generate-packages'

describe('generatePublicRoutesAt', () => {
    let tmp: string

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'public-routes-'))
    })

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true })
    })

    it('emits re-exports for a flat public route file', () => {
        const pkgDir = path.join(tmp, 'pkg')
        fs.mkdirSync(path.join(pkgDir, 'public-screens'), { recursive: true })
        fs.writeFileSync(
            path.join(pkgDir, 'public-screens/health.tsx'),
            'export default () => null'
        )
        const appDir = path.join(tmp, 'app')

        const written = generatePublicRoutesAt(
            '@tinycld/example',
            { publicRoutes: { directory: 'public-screens' } },
            pkgDir,
            appDir
        )

        expect(written).toEqual([path.join(appDir, 'health.tsx')])
        expect(fs.readFileSync(path.join(appDir, 'health.tsx'), 'utf8')).toBe(
            "export { default } from '@tinycld/example/public-screens/health'\n"
        )
    })

    it('emits re-exports for nested public route files', () => {
        const pkgDir = path.join(tmp, 'pkg')
        fs.mkdirSync(path.join(pkgDir, 'public-screens/share'), { recursive: true })
        fs.writeFileSync(
            path.join(pkgDir, 'public-screens/share/[token].tsx'),
            'export default () => null'
        )
        const appDir = path.join(tmp, 'app')

        const written = generatePublicRoutesAt(
            '@tinycld/example',
            { publicRoutes: { directory: 'public-screens' } },
            pkgDir,
            appDir
        )

        expect(written).toEqual([path.join(appDir, 'share/[token].tsx')])
        expect(fs.readFileSync(path.join(appDir, 'share/[token].tsx'), 'utf8')).toBe(
            "export { default } from '@tinycld/example/public-screens/share/[token]'\n"
        )
    })

    it('returns empty when the package has no publicRoutes', () => {
        const pkgDir = path.join(tmp, 'pkg')
        fs.mkdirSync(pkgDir)
        const appDir = path.join(tmp, 'app')

        const written = generatePublicRoutesAt('@tinycld/example', {}, pkgDir, appDir)
        expect(written).toEqual([])
    })

    it('returns empty when the declared directory does not exist on disk', () => {
        const pkgDir = path.join(tmp, 'pkg')
        fs.mkdirSync(pkgDir)
        const appDir = path.join(tmp, 'app')

        const written = generatePublicRoutesAt(
            '@tinycld/example',
            { publicRoutes: { directory: 'public-screens' } },
            pkgDir,
            appDir
        )
        expect(written).toEqual([])
    })

    it('ignores non-code files in the public routes tree', () => {
        const pkgDir = path.join(tmp, 'pkg')
        fs.mkdirSync(path.join(pkgDir, 'public-screens'), { recursive: true })
        fs.writeFileSync(
            path.join(pkgDir, 'public-screens/health.tsx'),
            'export default () => null'
        )
        fs.writeFileSync(path.join(pkgDir, 'public-screens/README.md'), '# docs')
        const appDir = path.join(tmp, 'app')

        const written = generatePublicRoutesAt(
            '@tinycld/example',
            { publicRoutes: { directory: 'public-screens' } },
            pkgDir,
            appDir
        )

        expect(written).toEqual([path.join(appDir, 'health.tsx')])
    })
})

describe('detectPublicRouteConflicts', () => {
    let tmp: string

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'public-routes-conflict-'))
    })

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true })
    })

    it('throws when two packages declare the same public route', () => {
        const pkgA = path.join(tmp, 'a')
        const pkgB = path.join(tmp, 'b')
        fs.mkdirSync(path.join(pkgA, 'public-screens'), { recursive: true })
        fs.mkdirSync(path.join(pkgB, 'public-screens'), { recursive: true })
        fs.writeFileSync(path.join(pkgA, 'public-screens/share.tsx'), '')
        fs.writeFileSync(path.join(pkgB, 'public-screens/share.tsx'), '')

        expect(() =>
            detectPublicRouteConflicts(
                [
                    {
                        packageName: '@tinycld/a',
                        manifest: { publicRoutes: { directory: 'public-screens' } },
                        packageDir: pkgA,
                    },
                    {
                        packageName: '@tinycld/b',
                        manifest: { publicRoutes: { directory: 'public-screens' } },
                        packageDir: pkgB,
                    },
                ],
                path.join(tmp, 'app')
            )
        ).toThrow(
            /Public route conflict: "share\.tsx" declared by both @tinycld\/a and @tinycld\/b/
        )
    })

    it('allows two packages with disjoint public routes', () => {
        const pkgA = path.join(tmp, 'a')
        const pkgB = path.join(tmp, 'b')
        fs.mkdirSync(path.join(pkgA, 'public-screens'), { recursive: true })
        fs.mkdirSync(path.join(pkgB, 'public-screens'), { recursive: true })
        fs.writeFileSync(path.join(pkgA, 'public-screens/share.tsx'), '')
        fs.writeFileSync(path.join(pkgB, 'public-screens/health.tsx'), '')

        expect(() =>
            detectPublicRouteConflicts(
                [
                    {
                        packageName: '@tinycld/a',
                        manifest: { publicRoutes: { directory: 'public-screens' } },
                        packageDir: pkgA,
                    },
                    {
                        packageName: '@tinycld/b',
                        manifest: { publicRoutes: { directory: 'public-screens' } },
                        packageDir: pkgB,
                    },
                ],
                path.join(tmp, 'app')
            )
        ).not.toThrow()
    })

    it('skips packages with no publicRoutes', () => {
        const pkgA = path.join(tmp, 'a')
        fs.mkdirSync(path.join(pkgA, 'public-screens'), { recursive: true })
        fs.writeFileSync(path.join(pkgA, 'public-screens/share.tsx'), '')

        expect(() =>
            detectPublicRouteConflicts(
                [
                    {
                        packageName: '@tinycld/a',
                        manifest: { publicRoutes: { directory: 'public-screens' } },
                        packageDir: pkgA,
                    },
                    {
                        packageName: '@tinycld/b',
                        manifest: {},
                        packageDir: path.join(tmp, 'does-not-exist'),
                    },
                ],
                path.join(tmp, 'app')
            )
        ).not.toThrow()
    })
})
