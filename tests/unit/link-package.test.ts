import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSiblingPackage, resolveSiblingDir } from '../../scripts/link-package'

describe('link-package helpers', () => {
    let tmp: string

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'link-pkg-'))
    })

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true })
    })

    describe('resolveSiblingDir', () => {
        it('treats a bare slug as a sibling directory under ../', () => {
            const coreRoot = path.join(tmp, 'core')
            fs.mkdirSync(coreRoot)
            expect(resolveSiblingDir(coreRoot, 'contacts')).toBe(
                path.resolve(coreRoot, '..', 'contacts')
            )
        })

        it('resolves a relative path against core root', () => {
            const coreRoot = path.join(tmp, 'core')
            fs.mkdirSync(coreRoot)
            expect(resolveSiblingDir(coreRoot, '../elsewhere/contacts')).toBe(
                path.resolve(coreRoot, '..', 'elsewhere', 'contacts')
            )
        })

        it('accepts an absolute path unchanged', () => {
            const coreRoot = path.join(tmp, 'core')
            fs.mkdirSync(coreRoot)
            const abs = path.join(tmp, 'abs', 'pkg')
            expect(resolveSiblingDir(coreRoot, abs)).toBe(abs)
        })

        it('rejects a scoped name — identity must come from package.json', () => {
            const coreRoot = path.join(tmp, 'core')
            fs.mkdirSync(coreRoot)
            expect(() => resolveSiblingDir(coreRoot, '@acme/custom')).toThrow(
                /sibling directory, not a package name/
            )
        })
    })

    describe('readSiblingPackage', () => {
        function makePkg(dir: string, name: string, withManifest = true) {
            fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name }))
            if (withManifest) fs.writeFileSync(path.join(dir, 'manifest.ts'), '')
        }

        it('returns a tinycld-scoped name', () => {
            const dir = path.join(tmp, 'contacts')
            makePkg(dir, '@tinycld/contacts')
            expect(readSiblingPackage(dir).name).toBe('@tinycld/contacts')
        })

        it('returns a third-party scoped name unchanged', () => {
            const dir = path.join(tmp, 'custom')
            makePkg(dir, '@acme/custom')
            expect(readSiblingPackage(dir).name).toBe('@acme/custom')
        })

        it('returns an unscoped name unchanged', () => {
            const dir = path.join(tmp, 'bare')
            makePkg(dir, 'bare-package')
            expect(readSiblingPackage(dir).name).toBe('bare-package')
        })

        it('rejects when the directory is missing', () => {
            expect(() => readSiblingPackage(path.join(tmp, 'nope'))).toThrow(/not found/)
        })

        it('rejects when package.json is missing', () => {
            const dir = path.join(tmp, 'no-pkg')
            fs.mkdirSync(dir)
            expect(() => readSiblingPackage(dir)).toThrow(/No package\.json/)
        })

        it('rejects when package.json has no name', () => {
            const dir = path.join(tmp, 'no-name')
            fs.mkdirSync(dir)
            fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({}))
            fs.writeFileSync(path.join(dir, 'manifest.ts'), '')
            expect(() => readSiblingPackage(dir)).toThrow(/missing a "name" field/)
        })

        it('rejects when manifest.ts is missing', () => {
            const dir = path.join(tmp, 'contacts')
            makePkg(dir, '@tinycld/contacts', false)
            expect(() => readSiblingPackage(dir)).toThrow(/manifest\.ts/)
        })
    })
})
