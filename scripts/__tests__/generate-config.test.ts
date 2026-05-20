import { describe, expect, it } from 'vitest'
import { buildConfigSource } from '../generate-config'

describe('buildConfigSource', () => {
    it('emits a typed entry per package with its contributions', () => {
        const src = buildConfigSource([
            {
                packageName: '@tinycld/contacts',
                slug: 'contacts',
                schemaType: 'ContactsSchema',
                hasRegister: true,
                hasSidebar: true,
                hasProvider: false,
                hasSeed: true,
                settings: [],
                manifest: {
                    name: 'Contacts',
                    slug: 'contacts',
                    version: '0.1.0',
                    description: 'x',
                },
            },
        ])
        // named registerCollections import, aliased per package
        expect(src).toContain(
            "import { registerCollections as contactsRegister } from '@tinycld/contacts/collections'"
        )
        // schema type import
        expect(src).toContain("import type { ContactsSchema } from '@tinycld/contacts/types'")
        // default seed import
        expect(src).toContain("import contactsSeed from '@tinycld/contacts/seed'")
        // lazy sidebar
        expect(src).toContain("lazy(() => import('@tinycld/contacts/sidebar'))")
        // the typed entry constructor with the schema type param
        expect(src).toContain('definePackageEntry<ContactsSchema>()')
        expect(src).toContain('registerCollections: contactsRegister')
        // manifest + packageName are emitted as JSON literals (double-quoted);
        // the written file is biome-formatted to single quotes afterward.
        expect(src).toContain('packageName: "@tinycld/contacts"')
        // the array shape
        expect(src).toContain('export const tinycldConfig = [')
        expect(src).toContain('] as const')
    })

    it('emits provider as a default import (eager) when present', () => {
        const src = buildConfigSource([
            {
                packageName: '@tinycld/calc',
                slug: 'calc',
                schemaType: 'CalcSchema',
                hasRegister: true,
                hasSidebar: false,
                hasProvider: true,
                hasSeed: true,
                settings: [],
                manifest: { name: 'Calc', slug: 'calc', version: '0.1.0', description: 'x' },
            },
        ])
        expect(src).toContain("import calcProvider from '@tinycld/calc/provider'")
        expect(src).toContain('provider: calcProvider')
    })

    it('handles a settings-only package (no register, no schema)', () => {
        const src = buildConfigSource([
            {
                packageName: '@tinycld/google-takeout-import',
                slug: 'google-takeout-import',
                schemaType: '',
                hasRegister: false,
                hasSidebar: false,
                hasProvider: false,
                hasSeed: false,
                settings: [
                    {
                        slug: 'google-takeout',
                        label: 'Import from Google',
                        component: 'settings/takeout',
                    },
                ],
                manifest: {
                    name: 'Google Takeout Import',
                    slug: 'google-takeout-import',
                    version: '0.1.0',
                    description: 'x',
                },
            },
        ])
        // no register import, no schema type
        expect(src).not.toContain('googleTakeoutImportRegister')
        // settings-only entry uses Record<string, never> as schema type
        expect(src).toContain('definePackageEntry<Record<string, never>>()')
        // lazy settings Component
        expect(src).toContain(
            "lazy(() => import('@tinycld/google-takeout-import/settings/takeout'))"
        )
        // settings literals are emitted JSON-style (double-quoted) pre-format
        expect(src).toContain('slug: "google-takeout"')
        expect(src).toContain('label: "Import from Google"')
    })
})
