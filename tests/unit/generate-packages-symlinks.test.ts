import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Imports the function we'll extract in Step 3
import { replaceSymlink } from '../../scripts/generate-packages'

describe('replaceSymlink', () => {
    let tmp: string

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-symlinks-'))
    })

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true })
    })

    it('creates a fresh symlink when none exists', () => {
        const source = path.join(tmp, 'source.js')
        const target = path.join(tmp, 'target.js')
        fs.writeFileSync(source, '// migration')

        replaceSymlink(source, target)

        expect(fs.lstatSync(target).isSymbolicLink()).toBe(true)
        expect(fs.readlinkSync(target)).toBe(source)
    })

    it('replaces a symlink that points at a stale target', () => {
        const oldSource = path.join(tmp, 'old.js')
        const newSource = path.join(tmp, 'new.js')
        const target = path.join(tmp, 'target.js')
        fs.writeFileSync(oldSource, '// old')
        fs.writeFileSync(newSource, '// new')
        fs.symlinkSync(oldSource, target)

        replaceSymlink(newSource, target)

        expect(fs.readlinkSync(target)).toBe(newSource)
    })

    it('leaves a correctly pointing symlink alone', () => {
        const source = path.join(tmp, 'source.js')
        const target = path.join(tmp, 'target.js')
        fs.writeFileSync(source, '// m')
        fs.symlinkSync(source, target)
        const mtimeBefore = fs.lstatSync(target).mtimeMs

        replaceSymlink(source, target)

        expect(fs.lstatSync(target).mtimeMs).toBe(mtimeBefore)
    })

    it('refuses to overwrite a regular file', () => {
        const source = path.join(tmp, 'source.js')
        const target = path.join(tmp, 'target.js')
        fs.writeFileSync(source, '// m')
        fs.writeFileSync(target, 'user wrote this')

        expect(() => replaceSymlink(source, target)).toThrow(/regular file/)
        expect(fs.readFileSync(target, 'utf8')).toBe('user wrote this')
    })
})

describe('createSymlinks tracking', () => {
    let tmp: string

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-tracking-'))
    })

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true })
    })

    it('reports every symlink it manages, even pre-existing correct ones', async () => {
        const pkgDir = path.join(tmp, 'pkg')
        const migrationsSrc = path.join(pkgDir, 'pb-migrations')
        fs.mkdirSync(migrationsSrc, { recursive: true })
        fs.writeFileSync(path.join(migrationsSrc, 'a.js'), '// a')
        fs.writeFileSync(path.join(migrationsSrc, 'b.js'), '// b')

        const migrationsDst = path.join(tmp, 'pb_migrations')
        fs.mkdirSync(migrationsDst)

        // Pre-create one correct symlink; the generator must still report it.
        fs.symlinkSync(path.join(migrationsSrc, 'a.js'), path.join(migrationsDst, 'a.js'))

        const { createSymlinksAt } = await import('../../scripts/generate-packages')
        const created = createSymlinksAt({ migrations: { directory: 'pb-migrations' } }, pkgDir, {
            migrationsDir: migrationsDst,
            hooksDir: path.join(tmp, 'pb_hooks'),
        })

        expect(created.sort()).toEqual(
            [path.join(migrationsDst, 'a.js'), path.join(migrationsDst, 'b.js')].sort()
        )
    })
})
