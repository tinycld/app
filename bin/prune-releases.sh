#!/bin/sh
# Delete release directories under /app/releases/ older than 7 days,
# never deleting the one /app/releases/current points at. Run by the
# Dokku cron declared in config/dokku.app.json.
#
# Age is measured by directory ctime, which is set when the entrypoint
# `mv`s the staged dir into place on the volume. mtime would be wrong
# here: `cp -a` in promote_release preserves source mtime (= image
# build time), so mtime tracks the build, not the promote.
set -eu

RELEASES_DIR=/app/releases
CURRENT=$(readlink "$RELEASES_DIR/current" 2>/dev/null || true)

if [ ! -d "$RELEASES_DIR" ]; then
    echo "[prune-releases] $RELEASES_DIR missing; nothing to prune"
    exit 0
fi

for dir in "$RELEASES_DIR"/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")
    if [ "$name" = "$CURRENT" ]; then
        echo "[prune-releases] skipping current release $name"
        continue
    fi
    # ctime + 7 days < now -> prune
    if [ "$(find "$dir" -maxdepth 0 -ctime +7 -print)" = "$dir" ]; then
        echo "[prune-releases] deleting $name"
        rm -rf "$dir"
    fi
done
