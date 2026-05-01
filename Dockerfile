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

# Build web app. EXPO_PUBLIC_* vars are inlined at bundle time, so they
# must be present in the environment when `expo export` runs. Pass them in
# via `docker build --build-arg`.
ARG EXPO_PUBLIC_SENTRY_DSN=
ARG EXPO_PUBLIC_GIT_COMMIT=
ARG RELEASE_ID
ENV EXPO_PUBLIC_ENV=web
ENV EXPO_PUBLIC_SENTRY_DSN=$EXPO_PUBLIC_SENTRY_DSN
ENV EXPO_PUBLIC_GIT_COMMIT=$EXPO_PUBLIC_GIT_COMMIT
ENV EXPO_PUBLIC_RELEASE_ID=$RELEASE_ID
ENV NODE_OPTIONS="--max-old-space-size=2048"

# --base-url rewrites every asset URL to /v/<RELEASE_ID>/... so stale tabs
# resolve their old asset URLs as long as that release directory exists on
# the host volume.
RUN bunx expo export --platform web --base-url=/v/$RELEASE_ID

# Stage the dist tree under release-staging/<id>/. The runtime entrypoint
# copies this to the persistent volume at /app/releases/<id>/ on container
# start. index.html is renamed to app.html (used as the SPA fallback file).
RUN mkdir -p /app/release-staging \
    && mv /app/dist /app/release-staging/$RELEASE_ID \
    && echo "$RELEASE_ID" > /app/release-staging/$RELEASE_ID/release-id.txt \
    && mv /app/release-staging/$RELEASE_ID/index.html /app/release-staging/$RELEASE_ID/app.html


# Build stage for Go server.
FROM golang:1.25-trixie AS go-builder

# Install CGo dependencies for mupdf (thumbnail generation via go-fitz).
RUN apt-get update \
    && apt-get install -y libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Bring in the full server tree from web-builder: generator has already
# rewritten go.mod with replace directives for each bundled package and
# emitted package_extensions.go. Copy the siblings too — the Go replace
# directives point at ../packages/@scope/name/server/ for siblings and
# ../packages/@tinycld/core/server/ for core itself.
COPY --from=web-builder /app/server/ ./server/
COPY --from=web-builder /app/packages ./packages

WORKDIR /app/server
# Use `go mod tidy` rather than just `go mod download`: the web-builder stage
# generates package_extensions.go and rewrites go.mod's require/replace block
# but can't run `go mod tidy` itself (no go toolchain in the bun image), so
# go.sum is stale. Running tidy here reconciles it before build.
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

# Full server tree (for runtime Go-package builds) + already-bundled packages.
COPY --from=go-builder /app/server/ ./server/
COPY --from=web-builder /app/packages ./packages

# bundled-packages.json so pkg_seed can find it at startup.
COPY --from=web-builder /app/server/bundled-packages.json ./bundled-packages.json

# Data + types + packages mount points.
RUN mkdir -p pb_data types

COPY config/dokku.app.json ./app.json
COPY config/entrypoint.sh ./entrypoint.sh

# 7090: default HTTP (backward compat / dev)
# 80/443: autocert HTTP/HTTPS (production with domain)
# 993: IMAPS (implicit TLS)
# 465: SMTPS (implicit TLS)
EXPOSE 80 443 993 465

# When SERVE_ON_DOMAINS is set (space-separated), serve with autocert on those domains.
# Otherwise fall back to plain HTTP on port 7090.
#   dokku config:set myapp SERVE_ON_DOMAINS="tinycld.com tinycld.org www.tinycld.org"
ENTRYPOINT ["./entrypoint.sh"]
