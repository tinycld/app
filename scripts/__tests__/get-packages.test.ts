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
