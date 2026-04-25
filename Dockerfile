# Build pipeline assumes the build context contains:
#   - tinycld/ repo at root
#   - packages/@tinycld/core/ — full core repo tree (a sibling, not a symlink)
#   - packages/@tinycld/<other>/ — one entry per linked feature package
# The deploy/build.sh script in the deploy/ sibling assembles this layout
# from the per-repo git HEADs before running `docker build`.

# Node stage: generate package wiring and build the web app
FROM oven/bun:1.3.12-debian AS web-builder

WORKDIR /app

# Install dependencies first (layer caching).
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# Copy app sources needed for package generation + web build.
COPY scripts/ ./scripts/
COPY server/ ./server/
COPY tinycld.packages.ts ./
COPY app.json tsconfig.json ./
COPY app/ ./app/
COPY lib/ ./lib/
COPY public/ ./public/
COPY react-native.config.cjs metro.config.cjs babel.config.cjs ./

# Copy every bundled sibling package — including @tinycld/core itself.
# The build context (assembled by deploy/build.sh) contains real directories
# under packages/, one per linked sibling: packages/@scope/name or
# packages/name. Core ships as packages/@tinycld/core/ here.
COPY packages/ ./packages/

# Generate package wiring (produces server/package_extensions.go,
# lib/generated/, app/a/[orgSlug]/<slug>/ routes, public route re-exports,
# server/pb_migrations/ symlinks, and updates server/go.mod replace
# directives). Output dir is overridden via TINYCLD_GENERATED_DIR; the
# default is core's nested tinycld/core/lib/generated which doesn't exist
# in this layout.
ENV TINYCLD_GENERATED_DIR=./lib/generated
RUN bun run scripts/generate-packages.ts

# Resolve any migration/hook symlinks into real files. generate-packages.ts
# symlinks package migrations into server/pb_migrations/, which is fine
# here (packages/ is real files in this build), but later COPY steps need
# real content, so materialize them in place.
RUN find server/pb_migrations server/pb_hooks -type l -exec sh -c 'target=$(readlink "$1") && rm "$1" && cp "$target" "$1"' _ {} \; 2>/dev/null || true

# Build web app.
ENV EXPO_PUBLIC_ENV=web
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN bunx expo export --platform web


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

# Built web app (Expo exports to dist/); rename index.html to app.html for SPA fallback.
COPY --from=web-builder /app/dist ./public
RUN mv ./public/index.html ./public/app.html

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
