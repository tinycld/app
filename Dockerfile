# Build pipeline assumes the build context contains:
#   - tinycld/ repo at root
#   - packages/@tinycld/core/ — full core source tree (real directory)
#   - packages/@tinycld/<other>/ — one entry per linked feature package
# The deploy/build.sh script in the deploy/ sibling assembles this layout
# from the per-repo git HEADs before running `docker build`.

# Node stage: generate package wiring and build the web app
FROM oven/bun:1.3.12-debian AS web-builder

WORKDIR /app

# Install dependencies first (layer caching). --ignore-scripts skips the
# project's `postinstall` (`bun run packages:generate`); the generator needs
# scripts/, lib/, and packages/, none of which are staged yet. We run it
# explicitly below once those are in place.
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --ignore-scripts

# Copy app sources needed for package generation + web build.
COPY scripts/ ./scripts/
COPY server/ ./server/
COPY tinycld.packages.ts ./
COPY app.json tsconfig.json ./
COPY app/ ./app/
COPY lib/ ./lib/
COPY public/ ./public/
COPY global.css ./
COPY react-native.config.cjs metro.config.cjs babel.config.cjs ./

# Copy every bundled sibling package — including @tinycld/core itself.
# The build context (assembled by deploy/build.sh) contains real directories
# under packages/, one per linked sibling: packages/@scope/name or
# packages/name. Core ships as packages/@tinycld/core/ here.
COPY packages/ ./packages/

# Optional: clone additional feature packages at build time.
#
# LINKED_PACKAGES is a space-separated list of `<git-url>[@<ref>]` entries.
# For each entry the build clones the repo into a temp dir, reads the
# package's name from package.json, and moves the working tree into
# packages/<scoped-name>/ as a real directory (no symlink, no node_modules).
# generate-packages.ts then picks up every linked package alongside core.
#
# Default is empty → lean shell (works as a fallback for `docker build .`
# from a fresh clone). The CI workflow passes a default set of feature
# packages so the public image ships with mail/calendar/contacts/drive/etc.
ARG LINKED_PACKAGES=""
RUN if [ -n "$LINKED_PACKAGES" ]; then \
        apt-get update && apt-get install -y --no-install-recommends git ca-certificates jq && rm -rf /var/lib/apt/lists/* ; \
        set -eu ; \
        for entry in $LINKED_PACKAGES; do \
            url="${entry%@*}" ; \
            ref="" ; \
            case "$entry" in *@*) ref="${entry#*@}" ;; esac ; \
            tmp=$(mktemp -d) ; \
            echo "[build] cloning $url${ref:+ @ $ref}" ; \
            git clone --depth 1 ${ref:+--branch "$ref"} "$url" "$tmp/repo" ; \
            name=$(jq -r '.name' "$tmp/repo/package.json") ; \
            [ -n "$name" ] && [ "$name" != "null" ] || { echo "no .name in $url package.json" >&2; exit 1; } ; \
            target="packages/$name" ; \
            mkdir -p "$(dirname "$target")" ; \
            rm -rf "$target" ; \
            mv "$tmp/repo" "$target" ; \
            rm -rf "$target/.git" "$target/node_modules" "$target/bun.lock" ; \
            echo "[build] linked $name → $target" ; \
        done ; \
    fi

# Generate package wiring (produces server/package_extensions.go,
# lib/generated/, app/a/[orgSlug]/<slug>/ routes, public route re-exports,
# server/pb_migrations/ symlinks, and updates server/go.mod replace
# directives).
RUN bun run scripts/generate-packages.ts

# Resolve any migration/hook symlinks into real files. generate-packages.ts
# symlinks package migrations into server/pb_migrations/, which is fine
# here (packages/ is real files in this build), but later COPY steps need
# real content, so materialize them in place.
RUN find server/pb_migrations server/pb_hooks -type l -exec sh -c 'target=$(readlink "$1") && rm "$1" && cp "$target" "$1"' _ {} \; 2>/dev/null || true

# Stage a tree containing only Go module manifests (go.mod / go.sum), with
# directory structure preserved. The go-builder stage copies just this tree
# to warm its module cache, so `go mod download` only re-runs when one of
# these files changes — independent of any Go source edits. tar with
# --files-from preserves the relative paths into the destination.
RUN mkdir -p /app/go-mod-staging \
    && cd /app \
    && find server packages \( -name go.mod -o -name go.sum \) -print0 \
        | tar --null --files-from=- -cf - \
        | tar -xf - -C /app/go-mod-staging

# Build web app. EXPO_PUBLIC_* vars are inlined at bundle time, so they
# must be present in the environment when `expo export` runs. Pass them in
# via `docker build --build-arg`.
ARG EXPO_PUBLIC_SENTRY_DSN=
ARG EXPO_PUBLIC_GIT_COMMIT=
ENV EXPO_PUBLIC_ENV=web
ENV EXPO_PUBLIC_SENTRY_DSN=$EXPO_PUBLIC_SENTRY_DSN
ENV EXPO_PUBLIC_GIT_COMMIT=$EXPO_PUBLIC_GIT_COMMIT
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Bring in .release-id, which deploy/deploy.sh writes into the deploy tree
# right before pushing to Dokku. Format: YYYY-MM-DD-HHMMSS-<short-sha>.
# When the file is absent (someone running `docker build` by hand without
# deploy.sh), the RUN below falls back to deriving an id internally.
COPY .release-id* ./

# Resolve effective release id and stage the dist tree under
# release-staging/<id>/. Done in one shell so the resolved id is consistent
# across all steps. The entrypoint promotes this directory to the
# persistent volume on container start, and renames the SPA shell from
# index.html to app.html. EXPO_PUBLIC_RELEASE_ID is inlined into the
# bundle so /api/version polling can detect when a deploy lands.
RUN set -eu \
    && if [ -s .release-id ]; then \
        rid=$(tr -d '[:space:]' < .release-id); \
    else \
        sha="${EXPO_PUBLIC_GIT_COMMIT:-deadbeef}"; \
        sha=$(printf '%s' "$sha" | cut -c1-7); \
        case "$sha" in *[!a-f0-9]*) sha=deadbeef;; esac; \
        rid="$(date -u +%Y-%m-%d-%H%M%S)-$sha"; \
    fi \
    && rm -f .release-id \
    && export EXPO_PUBLIC_RELEASE_ID="$rid" \
    && bunx expo export --platform web \
    && mkdir -p /app/release-staging \
    && mv /app/dist "/app/release-staging/$rid" \
    && printf '%s' "$rid" > "/app/release-staging/$rid/release-id.txt" \
    && mv "/app/release-staging/$rid/index.html" "/app/release-staging/$rid/app.html"


# Build stage for Go server.
FROM golang:1.25-trixie AS go-builder

# Install CGo dependencies for mupdf (thumbnail generation via go-fitz).
RUN apt-get update \
    && apt-get install -y libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Stage only go.mod / go.sum files first so the module-download layer caches
# until those files change. Without this, every source edit busts the cache
# and re-downloads ~hundreds of MB of Go modules. The app server's go.mod
# uses local `replace` directives pointing at sibling package server trees,
# so each replaced module's go.mod must be present too — the web-builder
# stage assembled all of them under /app/go-mod-staging/ with their original
# directory structure preserved.
COPY --from=web-builder /app/go-mod-staging/ ./

WORKDIR /app/server
# Warm the module cache. This layer is reused on every rebuild as long as
# none of the go.mod/go.sum files copied above changed.
RUN go mod download

# Now bring in the full server source. Changes here invalidate everything
# below but leave the (much larger) module-download layer above intact.
WORKDIR /app
COPY --from=web-builder /app/server/ ./server/
COPY --from=web-builder /app/packages ./packages

WORKDIR /app/server
# Reconcile go.sum after the full source lands. The web-builder stage
# generates package_extensions.go and rewrites go.mod's require/replace
# block but has no go toolchain available, so go.sum can be stale. With the
# module cache already warm from `go mod download` above, this is cheap and
# offline.
RUN go mod tidy

# Build the server binary.
RUN CGO_ENABLED=1 GOOS=linux go build -o tinycld .


# Final runtime stage
FROM debian:trixie-slim AS runtime

ENV SENTRY_DSN=""
ENV SERVE_ON_DOMAINS=""
ENV FZ_VERSION="1.25.1"

# Install runtime dependencies + Bun for runtime package installation.
RUN apt-get update \
    && apt-get install -y ca-certificates libffi8 libmupdf-dev curl unzip \
    && curl -fsSL https://bun.sh/install | bash \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun \
    && ln -s /root/.bun/bin/bunx /usr/local/bin/bunx \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy Go toolchain from build stage (needed for runtime Go-package builds).
COPY --from=go-builder /usr/local/go /usr/local/go
ENV PATH="/usr/local/go/bin:${PATH}"

WORKDIR /app

# Compiled server binary.
COPY --from=go-builder /app/server/tinycld ./tinycld

# Per-release web bundle, staged by the web-builder. The entrypoint promotes
# this to the persistent volume mounted at /app/releases/ on container start.
# The /app/public/ directory is reserved for the marketing website (populated
# by deploy/Dockerfile.tail).
COPY --from=web-builder /app/release-staging /app/release-staging
RUN mkdir -p /app/public /app/releases

# Migrations with symlinks already resolved in web-builder.
COPY --from=web-builder /app/server/pb_migrations ./pb_migrations

# Files needed for runtime package-install pipeline.
COPY --from=web-builder /app/package.json /app/bun.lock ./
COPY --from=web-builder /app/node_modules ./node_modules
COPY --from=web-builder /app/scripts ./scripts
COPY --from=web-builder /app/tinycld.packages.ts ./
# scripts/seed-db.ts imports lib/generated/package-seeds.ts (generated by
# scripts/generate-packages.ts in the web-builder stage). Cron jobs that
# reset the demo DB run seed-db at runtime, so the generated tree must
# ship in the runtime image.
COPY --from=web-builder /app/lib/generated ./lib/generated

# Full server tree (for runtime Go-package builds) + already-bundled packages.
COPY --from=go-builder /app/server/ ./server/
COPY --from=web-builder /app/packages ./packages

# bundled-packages.json so pkg_seed can find it at startup.
COPY --from=web-builder /app/server/bundled-packages.json ./bundled-packages.json

# Data + types + packages mount points.
RUN mkdir -p pb_data types

# Cron-invoked maintenance scripts.
COPY bin/ ./bin/
RUN chmod +x ./bin/*.sh

COPY config/dokku.app.json ./app.json
COPY config/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# 7090: default HTTP (backward compat / dev)
# 80/443: autocert HTTP/HTTPS (production with domain)
# 993: IMAPS (implicit TLS)
# 465: SMTPS (implicit TLS)
EXPOSE 80 443 993 465

# When SERVE_ON_DOMAINS is set (space-separated), serve with autocert on those domains.
# Otherwise fall back to plain HTTP on port 7090.
#   dokku config:set myapp SERVE_ON_DOMAINS="tinycld.com tinycld.org www.tinycld.org"
ENTRYPOINT ["./entrypoint.sh"]
