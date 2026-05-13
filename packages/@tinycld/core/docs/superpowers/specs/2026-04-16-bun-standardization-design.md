# Standardize on Bun as Package Manager

> **⚠️ Historical / superseded.** This design documents the project's earlier move to Bun. The project has since migrated to pnpm. Kept for historical context.

## Problem

The project has a hybrid package manager setup: a Bun lockfile (`bun.lockb`) but npm-style scripts (`npm run`, `npx`) and an `.npmrc` with `legacy-peer-deps=true`. This causes:

- Peer dependency conflicts papered over by `legacy-peer-deps` instead of being resolved
- Dependencies resolving differently across machines
- Bun's resolver producing different results than npm/Node expects at runtime
- Phantom dependencies from npm's flat hoisting

## Decision

Standardize fully on Bun. The project is already 60% there — this closes the gap.

## Constraints

- Must work with Expo EAS Build (EAS auto-detects `bun.lock` and uses Bun)

## Changes

### 1. Lockfile Migration

- Delete `bun.lockb` (binary format)
- Run `bun install` to generate `bun.lock` (text format, human-readable, available since Bun 1.2)
- Add `bun.lockb` to `.gitignore` as a safeguard
- Track `bun.lock` in git

### 2. Script Standardization

Replace all `npm run` / `npx` references in `package.json` scripts:

| Before | After |
|--------|-------|
| `npm run packages:generate` | `bun run packages:generate` |
| `npm run lint` | `bun run lint` |
| `npm run typecheck` | `bun run typecheck` |
| `npx expo ...` | `bunx expo ...` |
| `npx tsx ...` | `bunx tsx ...` |
| `npx vitest ...` | `bunx vitest ...` |
| `npx playwright ...` | `bunx playwright ...` |
| `npx eas ...` | `bunx eas ...` |

Update CONTRIBUTING.md script references if any still reference npm.

### 3. Remove `.npmrc`

Delete `.npmrc` (contains `legacy-peer-deps=true`). Bun handles peer dependencies differently — it installs them automatically and warns on conflicts. If peer dep conflicts surface, resolve them properly (version bumps, `overrides`) rather than hiding them.

### 4. EAS Build Compatibility

- EAS auto-detects `bun.lock` — no config changes needed
- Add `"packageManager": "bun@1.1.43"` to `package.json` for explicit enforcement
- Verify with a test build after migration
