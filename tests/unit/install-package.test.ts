import { describe, expect, it } from 'vitest'
import { deriveDirNameFromUrl, parseInstallFlags } from '../../scripts/install-package'

describe('deriveDirNameFromUrl', () => {
    it('extracts the last path segment of an https URL', () => {
        expect(deriveDirNameFromUrl('https://github.com/tinycld/contacts')).toBe('contacts')
    })

    it('strips a .git suffix', () => {
        expect(deriveDirNameFromUrl('https://github.com/tinycld/contacts.git')).toBe('contacts')
    })

    it('strips a trailing slash', () => {
        expect(deriveDirNameFromUrl('https://github.com/tinycld/contacts/')).toBe('contacts')
    })

    it('handles ssh URLs with the colon separator', () => {
        expect(deriveDirNameFromUrl('git@github.com:tinycld/contacts.git')).toBe('contacts')
    })

    it('accepts hyphenated names', () => {
        expect(deriveDirNameFromUrl('https://example.com/org/my-pkg.git')).toBe('my-pkg')
    })

    it('works for third-party (non-tinycld) URLs', () => {
        expect(deriveDirNameFromUrl('https://github.com/acme/custom-thing.git')).toBe(
            'custom-thing'
        )
    })

    it('rejects URLs whose last segment is empty', () => {
        expect(() => deriveDirNameFromUrl('https://example.com//')).toThrow(/Could not derive/)
    })

    it('rejects URLs whose last segment contains invalid chars', () => {
        expect(() => deriveDirNameFromUrl('https://example.com/org/bad name')).toThrow(
            /Could not derive/
        )
    })
})

describe('parseInstallFlags', () => {
    it('returns defaults for no flags', () => {
        expect(parseInstallFlags([])).toEqual({})
    })

    it('parses --path', () => {
        expect(parseInstallFlags(['--path', '../elsewhere'])).toEqual({
            overridePath: '../elsewhere',
        })
    })

    it('parses the short -p alias', () => {
        expect(parseInstallFlags(['-p', '../elsewhere'])).toEqual({
            overridePath: '../elsewhere',
        })
    })

    it('parses --ref', () => {
        expect(parseInstallFlags(['--ref', 'v0.2.0'])).toEqual({ ref: 'v0.2.0' })
    })

    it('parses both --path and --ref together', () => {
        expect(parseInstallFlags(['--path', '../x', '--ref', 'main'])).toEqual({
            overridePath: '../x',
            ref: 'main',
        })
    })

    it('throws when --path is given without a value', () => {
        expect(() => parseInstallFlags(['--path'])).toThrow(/requires a value/)
    })

    it('throws on unknown flags', () => {
        expect(() => parseInstallFlags(['--unknown'])).toThrow(/Unknown argument/)
    })
})
