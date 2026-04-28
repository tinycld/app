# Extract Packages to Sibling Repos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `@tinycld/contacts`, `@tinycld/mail`, `@tinycld/calendar`, `@tinycld/drive` out of core into sibling git repos, linked in at dev time via `bun link`. Core becomes a lean shell that works with zero packages.

**Architecture:** Two generator bug fixes make symlinks resilient when a package's on-disk location changes. A new `scripts/link-package.ts` wraps the seven-step link/unlink dance. Each package is then extracted to `../<slug>/` via `git subtree split` (preserving history), linked back, and removed from core's tree.

**Tech Stack:** TypeScript, bun 1.3.12 (`bun link` / `bun unlink`), tsx, vitest, git subtree.

**Spec:** `docs/superpowers/specs/2026-04-18-extract-packages-to-sibling-repos-design.md`

---

## Files Touched Overview

**Modified (generator):**
- `scripts/generate-packages.ts` — two bug fixes in symlink handling

**Created (new helper):**
- `scripts/link-package.ts` — CLI entry for `packages:link` / `packages:unlink`
- `scripts/package-list.ts` — small module for reading/writing `tinycld.packages.ts`
- `tests/unit/generate-packages-symlinks.test.ts` — regression test for Fix 1
- `tests/unit/link-package.test.ts` — unit test for the link helper

**Modified (top-level):**
- `package.json` — add `packages:link` + `packages:unlink` scripts; eventually drop `workspaces` entry
- `tinycld.packages.ts` — eventually defaulted to `[]`

**Removed (end of migration):**
- `packages/contacts/`, `packages/mail/`, `packages/calendar/`, `packages/drive/`

---

## Task 1: Generator Fix 1 — Replace Stale Migration/Hook Symlinks

**Files:**
- Modify: `scripts/generate-packages.ts:195-228` (the `createSymlinks` function)
- Test: `tests/unit/generate-packages-symlinks.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/generate-packages-symlinks.test.ts`. This test invokes the real generator logic on a temp filesystem. We extract `createSymlinks` from the generator module so we can test it directly — see Step 3 for the refactor that makes it importable.

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/generate-packages-symlinks.test.ts`

Expected: FAIL with "Cannot find module" or "`replaceSymlink` is not exported" — the function doesn't exist yet.

- [ ] **Step 3: Extract `replaceSymlink` and refactor `createSymlinks` to use it**

In `scripts/generate-packages.ts`, replace the `createSymlinks` function (lines 195-228) and add a new exported helper above it:

```typescript
export function replaceSymlink(source: string, target: string): void {
    let existing: fs.Stats | undefined
    try {
        existing = fs.lstatSync(target)
    } catch {
        // target doesn't exist
    }

    if (existing) {
        if (!existing.isSymbolicLink()) {
            throw new Error(
                `Refusing to replace regular file at ${target} — the generator only manages symlinks`
            )
        }
        const currentTarget = fs.readlinkSync(target)
        if (currentTarget === source) return
        fs.unlinkSync(target)
    }

    fs.symlinkSync(source, target)
}

function createSymlinks(manifest: PackageManifest, packageDir: string): string[] {
    const created: string[] = []

    if (manifest.migrations?.directory) {
        const migrationsSource = path.join(packageDir, manifest.migrations.directory)
        if (fs.existsSync(migrationsSource)) {
            for (const file of fs.readdirSync(migrationsSource)) {
                const target = path.join(MIGRATIONS_DIR, file)
                const source = path.join(migrationsSource, file)
                replaceSymlink(source, target)
                created.push(target)
            }
        }
    }

    if (manifest.hooks?.directory) {
        const hooksSource = path.join(packageDir, manifest.hooks.directory)
        if (fs.existsSync(hooksSource)) {
            fs.mkdirSync(HOOKS_DIR, { recursive: true })
            for (const file of fs.readdirSync(hooksSource)) {
                const target = path.join(HOOKS_DIR, file)
                const source = path.join(hooksSource, file)
                replaceSymlink(source, target)
                created.push(target)
            }
        }
    }

    return created
}
```

Delete the now-unused `symlinkOrFileExists` function (was at lines 186-193).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/generate-packages-symlinks.test.ts`

Expected: PASS, four tests green.

- [ ] **Step 5: Verify the full generator still runs**

Run: `bun run packages:generate`

Expected: exits 0 with no output (success). Confirms no regression in the real run against current in-tree packages.

- [ ] **Step 6: Run typecheck + lint**

Run: `bun run checks`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-packages.ts tests/unit/generate-packages-symlinks.test.ts
git commit -m "fix(packages): replace stale migration/hook symlinks on regeneration"
```

---

## Task 2: Generator Fix 2 — Track Every Created Symlink in the Manifest

**Files:**
- Modify: `scripts/generate-packages.ts` (the `createSymlinks` call and its callers)

**Why:** Each call to `replaceSymlink` inside `createSymlinks` already pushes the target into the `created` array, which gets returned and accumulated into `allSymlinks` at line 703. In principle this is already complete — but Fix 1 changed the behavior: previously, existing-but-correct symlinks were *not* added to `created` (the early-return case); now we want them to be, so `.package-links.json` always reflects the complete set of symlinks the generator is responsible for. Without this, a `packages:unlink` run followed by `packages:generate` could leave orphaned symlinks whose targets happen to still exist on disk.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/generate-packages-symlinks.test.ts`:

```typescript
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
        const created = createSymlinksAt(
            { migrations: { directory: 'pb-migrations' } },
            pkgDir,
            { migrationsDir: migrationsDst, hooksDir: path.join(tmp, 'pb_hooks') }
        )

        expect(created.sort()).toEqual(
            [path.join(migrationsDst, 'a.js'), path.join(migrationsDst, 'b.js')].sort()
        )
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/generate-packages-symlinks.test.ts -t "reports every"`

Expected: FAIL — `createSymlinksAt` doesn't exist yet.

- [ ] **Step 3: Introduce a testable variant of `createSymlinks` and keep the in-process caller thin**

In `scripts/generate-packages.ts`, replace the existing `createSymlinks` with a parameterized + exported variant, and a thin wrapper that feeds it the module-level constants:

```typescript
interface SymlinkDirs {
    migrationsDir: string
    hooksDir: string
}

export function createSymlinksAt(
    manifest: Pick<PackageManifest, 'migrations' | 'hooks'>,
    packageDir: string,
    dirs: SymlinkDirs
): string[] {
    const created: string[] = []

    if (manifest.migrations?.directory) {
        const migrationsSource = path.join(packageDir, manifest.migrations.directory)
        if (fs.existsSync(migrationsSource)) {
            for (const file of fs.readdirSync(migrationsSource)) {
                const target = path.join(dirs.migrationsDir, file)
                const source = path.join(migrationsSource, file)
                replaceSymlink(source, target)
                created.push(target)
            }
        }
    }

    if (manifest.hooks?.directory) {
        const hooksSource = path.join(packageDir, manifest.hooks.directory)
        if (fs.existsSync(hooksSource)) {
            fs.mkdirSync(dirs.hooksDir, { recursive: true })
            for (const file of fs.readdirSync(hooksSource)) {
                const target = path.join(dirs.hooksDir, file)
                const source = path.join(hooksSource, file)
                replaceSymlink(source, target)
                created.push(target)
            }
        }
    }

    return created
}

function createSymlinks(manifest: PackageManifest, packageDir: string): string[] {
    return createSymlinksAt(manifest, packageDir, {
        migrationsDir: MIGRATIONS_DIR,
        hooksDir: HOOKS_DIR,
    })
}
```

Note: `replaceSymlink` (from Task 1) already early-returns when the symlink is correct, *and* we still push to `created` in every iteration. That's the fix — every target the generator is responsible for lands in `created`, whether we touched it this run or not.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/generate-packages-symlinks.test.ts`

Expected: PASS, five tests green.

- [ ] **Step 5: Verify full generator still runs**

Run: `bun run packages:generate && bun run checks`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-packages.ts tests/unit/generate-packages-symlinks.test.ts
git commit -m "fix(packages): track every managed symlink in .package-links.json"
```

---

## Task 3: Extract `package-list.ts` Module

**Files:**
- Create: `scripts/package-list.ts`
- Test: `tests/unit/package-list.test.ts`

**Why:** The link/unlink helper needs to read and mutate `tinycld.packages.ts`. Putting that logic in its own module keeps `link-package.ts` focused and makes it unit-testable.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/package-list.test.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { readPackageList, addPackage, removePackage } from '../../scripts/package-list'

describe('package-list', () => {
    let tmp: string
    let file: string

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-list-'))
        file = path.join(tmp, 'tinycld.packages.ts')
    })

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true })
    })

    it('reads an empty list', () => {
        fs.writeFileSync(file, 'export const packages = [] as const\n')
        expect(readPackageList(file)).toEqual([])
    })

    it('reads a populated list', () => {
        fs.writeFileSync(
            file,
            "export const packages = [\n    '@tinycld/contacts',\n    '@tinycld/mail',\n] as const\n"
        )
        expect(readPackageList(file)).toEqual(['@tinycld/contacts', '@tinycld/mail'])
    })

    it('adds a package to an empty list', () => {
        fs.writeFileSync(file, 'export const packages = [] as const\n')
        addPackage(file, '@tinycld/contacts')
        expect(readPackageList(file)).toEqual(['@tinycld/contacts'])
    })

    it('adds a package preserving existing entries', () => {
        fs.writeFileSync(
            file,
            "export const packages = ['@tinycld/contacts'] as const\n"
        )
        addPackage(file, '@tinycld/mail')
        expect(readPackageList(file)).toEqual(['@tinycld/contacts', '@tinycld/mail'])
    })

    it('is idempotent when adding an existing package', () => {
        fs.writeFileSync(
            file,
            "export const packages = ['@tinycld/contacts'] as const\n"
        )
        const before = fs.readFileSync(file, 'utf8')
        addPackage(file, '@tinycld/contacts')
        expect(fs.readFileSync(file, 'utf8')).toBe(before)
    })

    it('removes a package', () => {
        fs.writeFileSync(
            file,
            "export const packages = ['@tinycld/contacts', '@tinycld/mail'] as const\n"
        )
        removePackage(file, '@tinycld/mail')
        expect(readPackageList(file)).toEqual(['@tinycld/contacts'])
    })

    it('is idempotent when removing a missing package', () => {
        fs.writeFileSync(file, 'export const packages = [] as const\n')
        const before = fs.readFileSync(file, 'utf8')
        removePackage(file, '@tinycld/mail')
        expect(fs.readFileSync(file, 'utf8')).toBe(before)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/package-list.test.ts`

Expected: FAIL — `scripts/package-list` does not exist.

- [ ] **Step 3: Implement `scripts/package-list.ts`**

```typescript
import * as fs from 'node:fs'

const ENTRY_REGEX = /'([^']+)'/g

export function readPackageList(filePath: string): string[] {
    const src = fs.readFileSync(filePath, 'utf8')
    const bodyMatch = src.match(/export const packages\s*=\s*\[([\s\S]*?)\]\s*as const/)
    if (!bodyMatch) {
        throw new Error(`Cannot parse package list in ${filePath}`)
    }
    const entries: string[] = []
    let m: RegExpExecArray | null
    ENTRY_REGEX.lastIndex = 0
    while ((m = ENTRY_REGEX.exec(bodyMatch[1])) !== null) {
        entries.push(m[1])
    }
    return entries
}

function writePackageList(filePath: string, entries: string[]): void {
    const lines =
        entries.length === 0
            ? 'export const packages = [] as const\n'
            : `export const packages = [\n${entries.map(e => `    '${e}',`).join('\n')}\n] as const\n`
    fs.writeFileSync(filePath, lines)
}

export function addPackage(filePath: string, pkg: string): void {
    const current = readPackageList(filePath)
    if (current.includes(pkg)) return
    writePackageList(filePath, [...current, pkg])
}

export function removePackage(filePath: string, pkg: string): void {
    const current = readPackageList(filePath)
    if (!current.includes(pkg)) return
    writePackageList(
        filePath,
        current.filter(e => e !== pkg)
    )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/package-list.test.ts`

Expected: PASS, seven tests green.

- [ ] **Step 5: Run full typecheck**

Run: `bun run checks`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/package-list.ts tests/unit/package-list.test.ts
git commit -m "feat(scripts): add package-list module for editing tinycld.packages.ts"
```

---

## Task 4: `scripts/link-package.ts` — Link Flow

**Files:**
- Create: `scripts/link-package.ts`
- Test: `tests/unit/link-package.test.ts`

**Why:** Wraps the seven-step dance described in the spec. We unit-test the pure pieces (resolving the sibling path, validating its `package.json`, composing commands) and smoke-test the orchestration separately.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/link-package.test.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { resolveSiblingDir, validateSiblingPackage } from '../../scripts/link-package'

describe('link-package helpers', () => {
    let tmp: string

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'link-pkg-'))
    })

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true })
    })

    describe('resolveSiblingDir', () => {
        it('defaults to ../<slug> relative to core root', () => {
            const coreRoot = path.join(tmp, 'core')
            fs.mkdirSync(coreRoot)
            const resolved = resolveSiblingDir(coreRoot, 'contacts', undefined)
            expect(resolved).toBe(path.resolve(coreRoot, '..', 'contacts'))
        })

        it('honors an explicit override path', () => {
            const coreRoot = path.join(tmp, 'core')
            fs.mkdirSync(coreRoot)
            const resolved = resolveSiblingDir(coreRoot, 'contacts', '../elsewhere/contacts')
            expect(resolved).toBe(path.resolve(coreRoot, '..', 'elsewhere', 'contacts'))
        })
    })

    describe('validateSiblingPackage', () => {
        it('accepts a valid package', () => {
            const dir = path.join(tmp, 'contacts')
            fs.mkdirSync(dir)
            fs.writeFileSync(
                path.join(dir, 'package.json'),
                JSON.stringify({ name: '@tinycld/contacts' })
            )
            fs.writeFileSync(path.join(dir, 'manifest.ts'), 'const manifest = {} as const')
            expect(() => validateSiblingPackage(dir, 'contacts')).not.toThrow()
        })

        it('rejects when the directory is missing', () => {
            expect(() => validateSiblingPackage(path.join(tmp, 'nope'), 'contacts')).toThrow(
                /not found/
            )
        })

        it('rejects when package.json name mismatches', () => {
            const dir = path.join(tmp, 'contacts')
            fs.mkdirSync(dir)
            fs.writeFileSync(
                path.join(dir, 'package.json'),
                JSON.stringify({ name: 'something-else' })
            )
            fs.writeFileSync(path.join(dir, 'manifest.ts'), '')
            expect(() => validateSiblingPackage(dir, 'contacts')).toThrow(
                /@tinycld\/contacts/
            )
        })

        it('rejects when manifest.ts is missing', () => {
            const dir = path.join(tmp, 'contacts')
            fs.mkdirSync(dir)
            fs.writeFileSync(
                path.join(dir, 'package.json'),
                JSON.stringify({ name: '@tinycld/contacts' })
            )
            expect(() => validateSiblingPackage(dir, 'contacts')).toThrow(/manifest\.ts/)
        })
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/link-package.test.ts`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `scripts/link-package.ts` helpers + main**

```typescript
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { addPackage, removePackage } from './package-list'

const ROOT = path.resolve(import.meta.dirname, '..')
const PACKAGES_FILE = path.join(ROOT, 'tinycld.packages.ts')
const NODE_MODULES_SCOPE = path.join(ROOT, 'node_modules', '@tinycld')

export function resolveSiblingDir(
    coreRoot: string,
    slug: string,
    override: string | undefined
): string {
    const target = override ?? path.join('..', slug)
    return path.resolve(coreRoot, target)
}

export function validateSiblingPackage(dir: string, slug: string): void {
    if (!fs.existsSync(dir)) {
        throw new Error(`Sibling package directory not found: ${dir}`)
    }
    const pkgJsonPath = path.join(dir, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) {
        throw new Error(`No package.json in ${dir}`)
    }
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    const expected = `@tinycld/${slug}`
    if (pkg.name !== expected) {
        throw new Error(
            `Sibling package.json name is "${pkg.name}", expected "${expected}"`
        )
    }
    if (!fs.existsSync(path.join(dir, 'manifest.ts'))) {
        throw new Error(`No manifest.ts in ${dir}`)
    }
}

function run(cmd: string, cwd: string): void {
    execSync(cmd, { cwd, stdio: 'inherit' })
}

function removeExistingInstall(slug: string): void {
    const target = path.join(NODE_MODULES_SCOPE, slug)
    try {
        const st = fs.lstatSync(target)
        if (st.isSymbolicLink()) {
            fs.unlinkSync(target)
        } else {
            fs.rmSync(target, { recursive: true, force: true })
        }
    } catch {
        // not present, nothing to remove
    }
}

export function linkPackage(slug: string, overridePath?: string): void {
    const siblingDir = resolveSiblingDir(ROOT, slug, overridePath)
    validateSiblingPackage(siblingDir, slug)

    run('bun link', siblingDir)
    removeExistingInstall(slug)
    run(`bun link @tinycld/${slug}`, ROOT)
    addPackage(PACKAGES_FILE, `@tinycld/${slug}`)
    run('bun run packages:generate', ROOT)
}

export function unlinkPackage(slug: string, overridePath?: string): void {
    removePackage(PACKAGES_FILE, `@tinycld/${slug}`)
    removeExistingInstall(slug)

    const siblingDir = resolveSiblingDir(ROOT, slug, overridePath)
    if (fs.existsSync(siblingDir)) {
        try {
            run('bun unlink', siblingDir)
        } catch {
            // sibling may not have been `bun link`-ed; ignore
        }
    }

    run('bun run packages:generate', ROOT)
}

const [mode, slug, overridePath] = process.argv.slice(2)

if (!mode || !slug || (mode !== 'link' && mode !== 'unlink')) {
    console.error('Usage: tsx scripts/link-package.ts <link|unlink> <slug> [path]')
    process.exit(2)
}

if (mode === 'link') {
    linkPackage(slug, overridePath)
} else {
    unlinkPackage(slug, overridePath)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/link-package.test.ts`

Expected: PASS, six tests green.

- [ ] **Step 5: Add npm scripts**

Edit `package.json` to add two scripts alongside the existing `packages:generate`:

```json
"packages:link": "bunx tsx scripts/link-package.ts link",
"packages:unlink": "bunx tsx scripts/link-package.ts unlink",
```

- [ ] **Step 6: Run full check suite**

Run: `bun run checks`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/link-package.ts tests/unit/link-package.test.ts package.json
git commit -m "feat(scripts): add packages:link and packages:unlink commands"
```

---

## Task 5: End-to-End Smoke Test of the Link Flow

**Files:** none created — this is a manual verification task that exercises real `bun link` against a copied-out package, mirroring the 2026-04-18 PoC. Catches anything the unit tests miss (global link registry interaction, generator resolution through the link, live edit propagation).

- [ ] **Step 1: Copy `contacts` to a sibling location as a throwaway**

```bash
cp -R packages/contacts ../contacts-smoke
rm -rf ../contacts-smoke/node_modules
```

- [ ] **Step 2: Hide the in-tree copy so bun's workspace doesn't shadow the link**

```bash
mv packages/contacts packages/.contacts-hidden
rm -f node_modules/@tinycld/contacts
```

- [ ] **Step 3: Run the new link command**

```bash
bun run packages:link contacts ../contacts-smoke
```

Expected: exits 0. `node_modules/@tinycld/contacts` is a symlink to `../contacts-smoke`. `tinycld.packages.ts` still lists `@tinycld/contacts`.

- [ ] **Step 4: Verify generator output**

```bash
readlink server/pb_migrations/1712000000_create_contacts.js
```

Expected output: a path containing `contacts-smoke/pb-migrations/…`.

- [ ] **Step 5: Verify typecheck passes**

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 6: Verify live edit propagation**

```bash
echo '// touched from sibling' >> ../contacts-smoke/manifest.ts
tail -2 node_modules/@tinycld/contacts/manifest.ts
```

Expected: the appended comment is visible through the symlink.

- [ ] **Step 7: Unlink and restore**

```bash
bun run packages:unlink contacts ../contacts-smoke
mv packages/.contacts-hidden packages/contacts
rm -rf ../contacts-smoke
bun install
bun run packages:generate
bun run checks
```

Expected: last three commands all exit 0. `git status` clean except for any test-only changes.

- [ ] **Step 8: No commit**

This task is a smoke test — no artifacts to commit. If any step failed, file the failure as a follow-up before proceeding.

---

## Task 6: Extract `@tinycld/contacts` to Sibling Repo

**Files:**
- Removed: `packages/contacts/`
- Created (outside core): `../contacts/` (new git repo)

- [ ] **Step 1: Use `git subtree split` to build a history-preserving branch**

From core's root:

```bash
git subtree split --prefix packages/contacts -b extract/contacts
```

Expected: a new local branch `extract/contacts` whose history contains only commits that touched `packages/contacts/`, rewritten as if that directory had been the repo root.

- [ ] **Step 2: Create the sibling repo from that branch**

```bash
mkdir ../contacts
cd ../contacts
git init
git pull /Users/nas/code/tinycld/core extract/contacts
```

Expected: `../contacts/` is a git repo containing `manifest.ts`, `package.json`, etc., with history preserved.

- [ ] **Step 3: Verify the sibling is well-formed (no `bun install`!)**

```bash
cd ../contacts
test -f package.json && test -f manifest.ts && echo "ok"
cd -
```

Expected: `ok`.

**Do NOT run `bun install` in the sibling.** bun auto-installs peer deps, which creates a duplicate of `react`, `react-native`, `pbtsdb`, `@tanstack/db`, etc. inside the sibling's `node_modules/`. Once linked into core, TypeScript sees two copies of every type and emits hundreds of "Type X is not assignable to type X" errors. The sibling inherits peer deps through core's `node_modules/` via the `bun link` symlink — that is the only copy that should exist.

If `node_modules/` already exists in the sibling (e.g. from earlier experimentation), delete it: `rm -rf ../<slug>/node_modules`.

- [ ] **Step 4: Hide the in-tree copy and link the sibling in**

```bash
mv packages/contacts packages/.contacts-during-extract
rm -f node_modules/@tinycld/contacts
bun run packages:link contacts
```

Expected: exits 0. `node_modules/@tinycld/contacts` → `../contacts`.

- [ ] **Step 5: Run the full check suite**

```bash
bun run checks
bun run test:unit
```

Expected: all PASS.

- [ ] **Step 6: Run contacts e2e tests to catch runtime regressions**

```bash
bun run test:e2e tests/e2e/contacts
```

(Use the actual contacts e2e path if different. Skip this step if no contacts-specific e2e exists.)

Expected: PASS.

- [ ] **Step 7: Delete the hidden in-tree copy and its workspace remnants**

```bash
rm -rf packages/.contacts-during-extract
# Also remove the workspace entry that bun remembers for this slot — regenerate
# node_modules cleanly:
rm -rf node_modules
bun install
bun run packages:link contacts    # re-establish the link after bun install
bun run checks
```

Expected: `bun run checks` exits 0. The `packages/` directory now lacks `contacts/`.

- [ ] **Step 8: Delete the throwaway branch**

```bash
git branch -D extract/contacts
```

- [ ] **Step 9: Commit the removal in core**

```bash
git add -A
git commit -m "refactor(packages): extract @tinycld/contacts to sibling repo"
```

`git status` should show the deleted `packages/contacts/*` files staged.

---

## Task 7: Extract `@tinycld/mail` to Sibling Repo

Repeat the full flow from Task 6 substituting `mail` for `contacts` everywhere. Same nine steps.

- [ ] Step 1: `git subtree split --prefix packages/mail -b extract/mail`
- [ ] Step 2: Create `../mail/` from the branch
- [ ] Step 3: Verify standalone build
- [ ] Step 4: Hide in-tree copy, run `bun run packages:link mail`
- [ ] Step 5: `bun run checks && bun run test:unit`
- [ ] Step 6: `bun run test:e2e tests/e2e/mail` (if present)
- [ ] Step 7: Delete hidden copy, reinstall, re-link, re-check
- [ ] Step 8: `git branch -D extract/mail`
- [ ] Step 9: Commit: `refactor(packages): extract @tinycld/mail to sibling repo`

**Stop condition:** Do NOT proceed to Task 8 if step 5 or 6 fails. The generator's Go-mod handling (`updateGoMod`, `runGoModTidy` at lines 759-761) is mail-heavier than contacts — watch for Go build failures.

---

## Task 8: Extract `@tinycld/calendar` to Sibling Repo

Repeat the flow from Task 6 substituting `calendar`.

- [ ] Step 1: `git subtree split --prefix packages/calendar -b extract/calendar`
- [ ] Step 2: Create `../calendar/`
- [ ] Step 3: Standalone build
- [ ] Step 4: Hide, link, run
- [ ] Step 5: `bun run checks && bun run test:unit`
- [ ] Step 6: `bun run test:e2e tests/e2e/calendar` (if present)
- [ ] Step 7: Delete, reinstall, re-link, re-check
- [ ] Step 8: `git branch -D extract/calendar`
- [ ] Step 9: Commit: `refactor(packages): extract @tinycld/calendar to sibling repo`

---

## Task 9: Extract `@tinycld/drive` to Sibling Repo

Repeat the flow from Task 6 substituting `drive`.

- [ ] Step 1: `git subtree split --prefix packages/drive -b extract/drive`
- [ ] Step 2: Create `../drive/`
- [ ] Step 3: Standalone build
- [ ] Step 4: Hide, link, run
- [ ] Step 5: `bun run checks && bun run test:unit`
- [ ] Step 6: `bun run test:e2e tests/e2e/drive` (if present)
- [ ] Step 7: Delete, reinstall, re-link, re-check
- [ ] Step 8: `git branch -D extract/drive`
- [ ] Step 9: Commit: `refactor(packages): extract @tinycld/drive to sibling repo`

---

## Task 10: Make Core Lean — Drop Workspaces Entry, Default Package List to Empty

**Files:**
- Modify: `package.json`
- Modify: `tinycld.packages.ts`

- [ ] **Step 1: Remove the `workspaces` entry from `package.json`**

Before:
```json
"workspaces": [
    "packages/*"
],
```

After: delete the whole `workspaces` key and its trailing comma.

- [ ] **Step 2: Remove the empty `packages/` directory if it still exists**

```bash
rmdir packages 2>/dev/null || true
ls packages 2>/dev/null && echo "WARN: packages dir not empty" || echo "gone"
```

Expected: "gone".

- [ ] **Step 3: Reinstall to drop the workspace link map**

```bash
rm -rf node_modules bun.lock
bun install
```

Expected: exits 0. No `@tinycld/*` entries in `node_modules` (they're all linked manually via `bun link` during development).

- [ ] **Step 4: Re-link whichever packages the dev working copy uses**

For each extracted package the current working copy needs:

```bash
bun run packages:link contacts
bun run packages:link mail
bun run packages:link calendar
bun run packages:link drive
```

- [ ] **Step 5: Default `tinycld.packages.ts` to empty**

The convention is that on a fresh clone the file is empty. But the *current* working tree has whatever packages the dev linked in — those entries are fine, they just shouldn't be committed as the default.

Decide: commit `tinycld.packages.ts` as `[]` (the new default), or keep it as-is and let each dev manage their own. **Recommendation: commit as `[]`.** The spec's "fresh clone works with zero packages" guarantee depends on this.

```bash
# Stash dev's current list, commit empty, then restore dev's list without committing
cp tinycld.packages.ts /tmp/packages.dev.ts
cat > tinycld.packages.ts <<'EOF'
export const packages = [] as const
EOF
```

- [ ] **Step 6: Verify a fresh state builds**

```bash
bun run packages:generate
bun run checks
```

Expected: PASS. The generator handles an empty list (see line 246 of `generate-packages.ts`).

- [ ] **Step 7: Commit the lean-core changes**

```bash
git add package.json tinycld.packages.ts
git commit -m "refactor(packages): drop workspaces glob; default package list to empty"
```

- [ ] **Step 8: Restore dev's working package list (local only, do not commit)**

```bash
cp /tmp/packages.dev.ts tinycld.packages.ts
bun run packages:generate
```

Note: this leaves a dirty working tree showing `tinycld.packages.ts` modified. That's expected — it records the *current dev session's* linked packages, which is personal state.

- [ ] **Step 9: Update `docs/packages.md`**

Rewrite the "Quick start" and "Creating a package" sections to describe the sibling + link workflow instead of the in-tree workspace workflow. Show:
- `bun run packages:link <slug>` as the primary install command
- `bun run packages:unlink <slug>` as the removal command
- The example dev flow from the spec's "Someone building a brand-new package" scenario

Commit separately:

```bash
git add docs/packages.md
git commit -m "docs: document sibling-package dev workflow"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Simulate a fresh-clone experience**

```bash
# In a throwaway directory
git clone <core repo> /tmp/core-fresh
cd /tmp/core-fresh
bun install
bun run packages:generate
bun run dev &
sleep 15
curl -sSf http://localhost:7100/ > /dev/null
kill %1
```

Expected: `curl` gets a 200. `bun run dev` starts without complaining about missing packages.

- [ ] **Step 2: Link one sibling and verify it lights up**

```bash
cd /tmp/core-fresh
git clone <sibling contacts remote-or-path> ../contacts
bun run packages:link contacts
bun run packages:generate
# Visit the contacts route or run its e2e subset
bun run test:e2e tests/e2e/contacts
```

Expected: PASS.

- [ ] **Step 3: Clean up**

```bash
rm -rf /tmp/core-fresh /tmp/contacts
```

- [ ] **Step 4: Record the result**

Update the spec's "Open questions" section with any findings, or mark it resolved if everything worked. Commit if changed.

---

## Done When

- All four packages live in sibling repos with preserved history.
- Core's `packages/` directory is gone.
- Core's `workspaces` entry is gone.
- `tinycld.packages.ts` defaults to `[]`.
- `bun run packages:link <slug>` / `bun run packages:unlink <slug>` work end-to-end.
- `bun run checks` and the unit test suite pass on a fresh clone with an empty package list.
- `docs/packages.md` reflects the new workflow.
