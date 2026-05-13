#!/usr/bin/env bash
# Install + link the feature packages that aren't bundled into this repo.
# Runs during EAS builds (via `eas-build-post-install` in package.json) so the
# production iOS/Android bundle includes their routes, settings panels, etc.
#
# Local dev does not need this — devs link siblings manually with
# `pnpm run packages:link`.

set -euo pipefail

REPO_BASE="${TINYCLD_PACKAGES_REPO_BASE:-https://github.com/tinycld}"

PACKAGES=(
    mail
    contacts
    calendar
    drive
)

for pkg in "${PACKAGES[@]}"; do
    echo "==> Installing @tinycld/${pkg}"
    pnpm run packages:install "${REPO_BASE}/${pkg}.git"
done

# Verify each package landed as a symlink under packages/@tinycld/. Without
# this guard, install-package's CLI block silently no-ops on some
# tsx/node combinations, the install loop "succeeds", and the build
# ships without feature routes.
missing=()
for pkg in "${PACKAGES[@]}"; do
    if [ ! -L "packages/@tinycld/${pkg}" ] && [ ! -d "packages/@tinycld/${pkg}" ]; then
        missing+=("@tinycld/${pkg}")
    fi
done
if [ "${#missing[@]}" -gt 0 ]; then
    echo "FATAL: feature packages did not link: ${missing[*]}" >&2
    ls -la packages/@tinycld/ >&2 || true
    exit 1
fi
