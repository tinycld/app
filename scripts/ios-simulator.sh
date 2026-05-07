#!/usr/bin/env bash
# Wrapper for `expo run:ios` that targets the simulator UDID configured in
# ../.env. Passes any extra flags through to expo (e.g. --no-bundler).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/../.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "ios-simulator: $ENV_FILE not found" >&2
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ -z "${IPHONE_SIMULATOR_UDID:-}" ]; then
    echo "ios-simulator: IPHONE_SIMULATOR_UDID not set in $ENV_FILE" >&2
    exit 1
fi

cd "$ROOT"
# RCT_METRO_PORT is baked into the iOS binary at xcodebuild time (via
# RCTDefines.h), defaulting to 8081. We override it to 7100 — the dev.ts
# proxy port — so the simulator loads the bundle through the same proxy
# that routes /api and /_ to PocketBase. --port 7100 also tells the
# (skipped) bundler to use that port if --no-bundler is removed.
#
# Important: the simulator speaks plain HTTP. dev.ts runs the proxy with
# TLS by default when assets/localhost*.pem exist — run `bun start --
# --no-ssl` (or delete the certs) when using the simulator, otherwise
# the bundle fetch fails with a TLS handshake error.
export EXPO_PACKAGER_PROXY_URL=http://localhost:7102
#exec env RCT_METRO_PORT=7100
bunx expo run:ios --device "$IPHONE_SIMULATOR_UDID" --no-bundler "$@"
