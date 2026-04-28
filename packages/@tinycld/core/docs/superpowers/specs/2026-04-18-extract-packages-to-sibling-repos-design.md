# Extract Packages to Sibling Repos (bun link)

## Goal

Let core ship without any packages, and let downstream builds opt in to only the packages they need. Core becomes a lean app shell; `@tinycld/contacts`, `@tinycld/mail`, `@tinycld/calendar`, and `@tinycld/drive` become independent repos cloned as siblings of core. A developer who wants to build an example package does not have to clone or touch the official ones.

## Non-goals

- Publishing packages to npm (neither public nor private). Out of scope for now; revisit once there are third-party consumers.
- Git submodules. We considered them and picked `bun link` instead because it has no git coupling between core and packages.
- Separating package release cycles with semver/version pinning. Everything rides HEAD of the sibling repo until there's a real reason to pin.

## Background

Today, all four packages live inside `packages/*` under core and are picked up by bun's `workspaces: ["packages/*"]` glob. `tinycld.packages.ts` lists which ones are wired in; `scripts/generate-packages.ts` reads that list, resolves each package via `import.meta.resolve`, re-exports screens into `app/a/[orgSlug]/<slug>/`, registers collections, and symlinks PocketBase migrations and hooks into `server/pb_migrations/` and `server/pb_hooks/`. `installed-packages.json` and `.package-links.json` track installed metadata and generated artifacts respectively.

A proof of concept (2026-04-18) confirmed that `bun link` works end-to-end against the generator with zero code changes: `import.meta.resolve` (generate-packages.ts:108-123) follows the link, typecheck passes, and live edits in the sibling repo are visible through `node_modules/@tinycld/<pkg>` immediately.

## Design

### Repo layout

After extraction:

```
~/code/tinycld/
    core/                 # this repo — no packages/ dir
    contacts/             # new repo: @tinycld/contacts
    mail/                 # new repo: @tinycld/mail
    calendar/             # new repo: @tinycld/calendar
    drive/                # new repo: @tinycld/drive
```

Each extracted package repo contains exactly what `packages/<slug>/` contains today (`package.json`, `manifest.ts`, `types.ts`, `collections.ts`, `screens/`, `pb-migrations/`, optional `pb-hooks/`, `server/`, `components/`, `hooks/`, `stores/`, `tests/`, `seed.ts`, `sidebar.tsx`). No structural change to the package itself — it just lives in its own git repo.

### Core changes

1. **`package.json`:** drop `"packages/*"` from `workspaces`. Core has no workspace packages anymore.
2. **`tinycld.packages.ts`:** stays as the source of truth for what gets wired in. By default on a fresh clone it is **empty** (`export const packages = [] as const`). Cloning core and running `bun install && bun run dev` gives you a working shell with no packages, no errors.
3. **Delete the `packages/` directory** from core's tree.
4. **`.gitignore`:** no changes needed (the directory is gone, not ignored).
5. **Generator (`scripts/generate-packages.ts`):** two small fixes surfaced during the PoC, both in the symlink-management path.

### Generator fixes

**Fix 1 — stale symlink replacement.** Lines 198-221 currently skip creating a migration/hook symlink if one already exists at the target path (`if (!symlinkOrFileExists(target))`). That means when a package's `packageDir` changes (workspace copy → linked sibling, or sibling path A → sibling path B), old symlinks keep pointing at the previous location. Change: if the existing entry is a symlink whose target doesn't match the intended source, `unlink` and recreate. Regular files (non-symlinks) still short-circuit so we don't clobber anything the user wrote.

**Fix 2 — `.package-links.json` tracking completeness.** During the PoC, migration symlinks for `contacts` existed on disk but weren't listed in `.package-links.json`, so the `cleanPrevious` pass didn't remove them. Ensure every symlink the generator creates is recorded in the manifest for the next run's cleanup. No change to the schema — just make sure the bookkeeping path is hit for every `symlinkSync` call, including the one in the pb-hooks branch.

These fixes are useful independent of this extraction; they just become load-bearing once package locations are fluid.

### New helper: `bun run packages:link`

A thin wrapper in `scripts/link-package.ts` for the common dev flow. Invoked as:

```sh
bun run packages:link contacts           # link ../contacts into core
bun run packages:link contacts ../../elsewhere/contacts   # custom path
bun run packages:unlink contacts         # remove the link
```

What `packages:link <slug>` does:

1. Resolve the sibling directory (default: `../<slug>` relative to core's root; allow override).
2. Verify it looks like a tinycld package: has `package.json` with name `@tinycld/<slug>` and a `manifest.ts`.
3. `cd <sibling> && bun link` to register the global link (idempotent).
4. Remove any existing `node_modules/@tinycld/<slug>` in core (the workspace or stale link, if present).
5. `cd core && bun link @tinycld/<slug>` to install the link.
6. Add `@tinycld/<slug>` to `tinycld.packages.ts` if not already listed.
7. Run `bun run packages:generate` to wire everything up.

What `packages:unlink <slug>` does:

1. Remove `@tinycld/<slug>` from `tinycld.packages.ts`.
2. Remove the link symlink from `node_modules/@tinycld/`.
3. `cd <sibling> && bun unlink` (the only form of `bun unlink` that works in 1.3.12 — there's no `bun unlink <pkg>`).
4. Run `bun run packages:generate` to clean up routes/migrations/registry for the removed package.

Both commands are pure orchestration around bun + the existing generator; no new resolution logic.

### Dev workflow

**Someone building a brand-new package (the motivating case):**

```sh
git clone tinycld/core
cd core
bun install
bun run dev                    # works, shows the shell with no packages

# elsewhere:
mkdir ../example-pkg && cd ../example-pkg
# scaffold a package (package.json with name @tinycld/example, manifest.ts, etc.)
cd ../core
bun run packages:link example ../example-pkg
bun run dev                    # now has the example package wired in
```

No access to any other tinycld package repo required. No submodules. No npm publish.

**Someone hacking on core + official packages together:**

```sh
git clone tinycld/core
git clone tinycld/contacts     # sibling
git clone tinycld/mail         # sibling
cd core
bun install
bun run packages:link contacts
bun run packages:link mail
bun run dev
```

Edits in `~/code/tinycld/contacts` flow through immediately. Commits land in each repo independently; core's git history is no longer polluted with package-internal churn.

**Someone shipping a production build with only contacts + mail:**

CI job (or deployment script) clones core, clones the two package repos it wants, runs `packages:link` for each, then `bun run build:web`. The resulting bundle contains only those two packages. Calendar and drive are never cloned, never installed, never referenced.

### What about the workspace-style flow we have today?

Gone. After this change, `packages/*` inside core doesn't exist as a thing bun knows about. Developers who want "one repo, one `bun install`, everything works" can still get that experience — they just run the link commands once and they persist in `bun`'s global link registry. The `tinycld.packages.ts` file records which packages are *wired in*; the global link registry records which are *resolved from siblings*. A package must be in both to work.

### Migration plan

Order matters because each extraction is mildly destructive (git history for the package moves out of core).

1. **Land generator fixes** (stale symlink replacement, complete manifest tracking) as a standalone PR. Safe independent change.
2. **Add `scripts/link-package.ts`** and the `packages:link` / `packages:unlink` npm scripts. Also standalone.
3. **Extract `@tinycld/contacts`** first (smallest, fewest cross-package dependencies):
   - Create a new local git repo at `../contacts` seeded with `git subtree split --prefix packages/contacts` from core to preserve history. The user pushes to a remote manually afterward.
   - Verify the sibling clone builds standalone (typecheck, its own tests).
   - In core: `bun run packages:link contacts` pointing at the new sibling; run full check suite (`bun run checks`, `bun run test:unit`, `bun run test:e2e` for contacts).
   - Once green, `git rm -r packages/contacts` in core.
4. **Repeat for mail, calendar, drive** one at a time.
5. **Remove `"packages/*"` from `workspaces`** and default `tinycld.packages.ts` to `[]` once all four are extracted.
6. **Update `docs/packages.md`** to describe the new dev flow.

After step 5, core is a lean shell. Anyone who clones it gets a working app with no packages; adding packages is a link step.

### Error handling and edge cases

- **Sibling not found:** `packages:link` errors with a clear message including the searched path.
- **Sibling's `package.json` name doesn't match `@tinycld/<slug>`:** reject rather than linking something mislabeled.
- **Link target gets moved/deleted on disk:** `node_modules/@tinycld/<slug>` becomes a dangling symlink. The generator's `import.meta.resolve` call will throw. We catch and print a message pointing the user at `packages:link` or `packages:unlink`.
- **`bun install` overwrites a link:** documented behavior — the recommended order is `bun install` first, then link. If a user hits it, `packages:link` is idempotent, so re-running it fixes the state.
- **Stale `lib/generated/` entries after removing a package from `tinycld.packages.ts`:** already handled by the existing `cleanPrevious` pass, which the generator fixes make reliable.
- **Sibling MUST NOT have its own `node_modules/`.** bun auto-installs peer dependencies, so `bun install` inside a sibling package creates a duplicate of every peer (`react`, `react-native`, `pbtsdb`, `@tanstack/db`, …). Under the `bun link` symlink, TypeScript sees two copies of every type and fails with a flood of "Type X is not assignable to type X" errors. Each sibling package repo should commit a `.gitignore` rule for `node_modules/` AND `bun.lock` (a tracked lockfile invites future `bun install` runs, which recreate `node_modules/`) — and skip `bun install` during dev. The sibling gets its peer deps through core's `node_modules/` via the symlink. If the sibling does need to install something for its own tests, use `bun install --no-peer` (bun does not expose this flag today — workaround: delete `node_modules/` after install). This is a real operational constraint, not a nice-to-have.

- **Sibling `package.json` `exports` map MUST use wildcards for screens with bracket subpaths.** Expo's Metro bundler does not resolve literal bracket-name subpath entries like `"./screens/[id]": "./screens/[id].tsx"` even with `unstable_enablePackageExports: true`. Use a single wildcard pattern instead: `"./screens/*": "./screens/*.tsx"`. This works for both literal (`./screens/index`) and bracket (`./screens/[id]`, `./screens/[...path]`) subpaths. Same goes for `./public-screens/*`, `./hooks/*`, `./components/*`, `./settings/*` — wildcard patterns are friendlier to bundlers and they're the convention we now follow.

### Testing

- Unit test for `link-package.ts`: mock filesystem, verify the link/unlink steps happen in order and short-circuit correctly on invalid input.
- E2E smoke test: CI job that clones core, links contacts from a sibling fixture, runs `bun run dev` long enough to hit the contacts list page, asserts the server returns 200.
- Regression: add a generator test that covers the "package dir changed" case (fixture with an old symlink pointing at path A, new resolution points at path B, assert the symlink gets replaced).

## Alternatives considered

- **Git submodules** (Approach 1 in brainstorming): gives reproducible checkouts via commit SHAs but has well-known ergonomic pain (detached HEADs, two-step commits, stale submodule pointers). Rejected because the user's goal is deployment flexibility, not reproducibility, and `bun link` achieves the goal with no git-level coupling.
- **Publish packages to npm** (Approach 2): requires a publish workflow for every change, including local dev. Overkill until there are third-party consumers. Leaves the door open — we can layer npm publishing on top of this design later without rework.
- **Keep workspace, just ignore unused packages at build time:** doesn't meet the stated goal of keeping sources out of the core bundle / tree. A lean core repo is part of the deliverable.

## Open questions

- Should `tinycld.packages.ts` support a shorthand for "link everything under `../`"? Probably not — explicit is better, and four one-line commands is cheap.
