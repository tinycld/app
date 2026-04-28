# @tinycld/app

The runnable [TinyCld](https://tinycld.org) app — Expo Router on the front, PocketBase on the
back, every feature shipped as a separately-installable package.

This repo bundles `@tinycld/core` (the shared TypeScript + Go library) directly at
`packages/@tinycld/core/` along with branding, Expo native projects, deployment configs, and
the package generator. It's the entrypoint for `bun run dev` and `docker pull tinycld/tinycld`.

```
~/code/tinycld/
    tinycld/                 # @tinycld/app — this repo (bundles @tinycld/core)
    core/                    # symlink → tinycld/packages/@tinycld/core/
    mail/                    # @tinycld/mail (feature package)
    calendar/                # @tinycld/calendar
    contacts/                # @tinycld/contacts
    drive/                   # @tinycld/drive
    google-takeout-import/   # @tinycld/google-takeout-import
```

The `~/code/tinycld/core/` symlink keeps feature sibling repos' `../core/...` tsconfig
references resolving without any sibling-side change.

## Quick start

```sh
git clone https://github.com/tinycld/tinycld.git ~/code/tinycld/tinycld
cd ~/code/tinycld/tinycld
bun install
bun run packages:install git@github.com:tinycld/mail.git    # add features as needed
bun run dev
```

`bun run dev` runs three processes in parallel: the Expo bundler on port 7100, the Go
PocketBase server on 7093, and a local SSL proxy on 7090 → 7093. Visit
`https://localhost:7090`.

## What's where

- **`app/`** — Expo Router routes. `_layout.tsx` calls `configureCore(appConfig)` first, then
  imports core's Providers and mounts the gate.
- **`lib/app-config.ts`** — `CoreConfig` value handed to core at boot. Branding, server
  shortcuts, Sentry creds, review-mode flags.
- **`lib/configure-core.ts`** — side-effect-only module imported first by `_layout.tsx` so
  `configureCore` runs before any other `@tinycld/core/*` import.
- **`lib/generated/`** — package-registry/collections/sidebars/providers/settings/seeds.
  Generator output. Gitignored.
- **`packages/@tinycld/core/`** — bundled shared library (`tinycld/core/{lib,ui,components,types}/`,
  `server/coreserver/...`, migrations). No separate git repo.
- **`packages/@tinycld/{mail,calendar,…}`** — symlinks to feature sibling repos. Metro and
  vitest scan this tree.
- **`scripts/generate-packages.ts`** — the generator. Reads `tinycld.packages.ts` + each
  feature package's `manifest.ts`, writes route re-exports, the registry, Go server wiring,
  and PocketBase migration symlinks. Honors `TINYCLD_APP_ROOT`, `TINYCLD_GENERATED_DIR`,
  `TINYCLD_APP_DIR`, `TINYCLD_SERVER_DIR`, `TINYCLD_CORE_IMPORT_ALIAS`.
- **`server/main.go`** — ~50 lines: load env, init Sentry, build `coreserver.Options`, call
  `coreserver.Register(app, opts)`. Module `tinycld.org/app` with
  `replace tinycld.org/core => ../packages/@tinycld/core/server`.
- **`server/pb_migrations/`** — landing dir for symlinks. Generator populates from core's
  `server/pb_migrations/` plus each linked feature package's `pb-migrations/`.
- **`Dockerfile`, `docker-compose.yml`, `eas.json`** — deployment.

## Adding / removing feature packages

```sh
bun run packages:install <git-url>     # clone + link + regenerate
bun run packages:link <package-name>   # link an already-cloned sibling
bun run packages:unlink <package-name> # remove a link
```

After any change, `bun run packages:generate` (also runs as `predev` and `postinstall`).

## Working in this repo

```sh
bun install                       # also runs packages:generate via postinstall hook
bun run checks                    # biome + tsc
bun run test:unit                 # vitest
bun run test:e2e                  # playwright
cd server && go build -o tinycld . && ./tinycld --help
```

## Code style

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions — no `useState`/`useEffect` shortcuts,
semantic Tailwind tokens, pbtsdb for data, etc.

## Deploy

```sh
docker pull tinycld/tinycld
```

The image bakes the Go binary, Expo web export, and PocketBase server into one container.
Healthchecks and Let's Encrypt-friendly cert handling are baked in. Dokku one-liner deploys
work via `app.json` + the `Procfile` analog in `Dockerfile`.

## License

[AGPL-3.0](LICENSE). Commercial relicensing available — open an issue to discuss.
