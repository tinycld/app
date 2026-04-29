import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanInstalledPackages } from '../../scripts/scan-installed-packages'

let tmp: string

beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-installed-'))
})

afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
})

function writePkg(dir: string, json: object, opts: { manifest?: boolean } = {}) {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(json))
    if (opts.manifest) {
        fs.writeFileSync(path.join(dir, 'manifest.ts'), 'export default {}')
    }
}

describe('scanInstalledPackages', () => {
    it('returns empty list when node_modules is missing', () => {
        expect(scanInstalledPackages(path.join(tmp, 'node_modules'))).toEqual([])
    })

    it('finds unscoped packages with "tinycld": true', () => {
        writePkg(path.join(tmp, 'pkg-a'), { name: 'pkg-a', tinycld: true })
        const found = scanInstalledPackages(tmp)
            .map(p => p.name)
            .sort()
        expect(found).toEqual(['pkg-a'])
    })

    it('finds scoped packages with "tinycld": true', () => {
        writePkg(path.join(tmp, '@acme', 'pkg-a'), { name: '@acme/pkg-a', tinycld: true })
        const found = scanInstalledPackages(tmp)
            .map(p => p.name)
            .sort()
        expect(found).toEqual(['@acme/pkg-a'])
    })

    it('finds packages with manifest.ts fallback (no tinycld field)', () => {
        writePkg(path.join(tmp, 'pkg-b'), { name: 'pkg-b' }, { manifest: true })
        const found = scanInstalledPackages(tmp)
            .map(p => p.name)
            .sort()
        expect(found).toEqual(['pkg-b'])
    })

    it('ignores packages without "tinycld" field and without manifest.ts', () => {
        writePkg(path.join(tmp, 'react'), { name: 'react' })
        writePkg(path.join(tmp, 'lodash'), { name: 'lodash' })
        expect(scanInstalledPackages(tmp)).toEqual([])
    })

    it('ignores .bin and .cache and dotfiles', () => {
        fs.mkdirSync(path.join(tmp, '.bin'), { recursive: true })
        fs.mkdirSync(path.join(tmp, '.cache'), { recursive: true })
        writePkg(path.join(tmp, 'pkg-a'), { name: 'pkg-a', tinycld: true })
        const found = scanInstalledPackages(tmp)
            .map(p => p.name)
            .sort()
        expect(found).toEqual(['pkg-a'])
    })

    it('ignores broken symlinks and missing package.json gracefully', () => {
        fs.symlinkSync('/nonexistent', path.join(tmp, 'broken'))
        fs.mkdirSync(path.join(tmp, 'no-pkg-json'), { recursive: true })
        writePkg(path.join(tmp, 'pkg-a'), { name: 'pkg-a', tinycld: true })
        const found = scanInstalledPackages(tmp)
            .map(p => p.name)
            .sort()
        expect(found).toEqual(['pkg-a'])
    })

    it('returns name and absolute path for each package', () => {
        writePkg(path.join(tmp, '@acme', 'pkg-a'), { name: '@acme/pkg-a', tinycld: true })
        const found = scanInstalledPackages(tmp)
        expect(found).toEqual([{ name: '@acme/pkg-a', dir: path.join(tmp, '@acme', 'pkg-a') }])
    })

    it('handles tinycld field as object form', () => {
        writePkg(path.join(tmp, 'pkg-a'), { name: 'pkg-a', tinycld: { manifest: './manifest.ts' } })
        const found = scanInstalledPackages(tmp).map(p => p.name)
        expect(found).toEqual(['pkg-a'])
    })

    it('is idempotent across repeated scans', () => {
        writePkg(path.join(tmp, 'pkg-a'), { name: 'pkg-a', tinycld: true })
        const first = scanInstalledPackages(tmp)
        const second = scanInstalledPackages(tmp)
        expect(first).toEqual(second)
    })
})
