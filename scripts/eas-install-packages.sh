#!/usr/bin/env bash
# Install + link the feature packages that aren't bundled into this repo.
# Runs during EAS builds (via `eas-build-post-install` in package.json) so the
# production iOS/Android bundle includes their routes, settings panels, etc.
#
# Local dev does not need this — devs link siblings manually with
# `bun run packages:link`.

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
    bun run packages:install "${REPO_BASE}/${pkg}.git"
done
