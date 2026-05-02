#!/bin/sh
set -e

HEALTH_PORT=19876

echo "[entrypoint] starting; pwd=$(pwd) user=$(id -un) uid=$(id -u)"

# Promote the staged release to the persistent volume mounted at
# /app/releases/. Runs on every container start; idempotent.
#
# Layout produced on the volume:
#   /app/releases/<id>/             per-release dir: app.html + release-id.txt
#   /app/releases/_static/          cross-release asset pool:
#     /app/releases/_static/_expo/static/...    (content-hashed, immutable)
#     /app/releases/_static/assets/...           (mostly hashed; a few stable
#                                                 names like app-icon.png get
#                                                 overwritten per deploy)
#   /app/releases/current → <id>    SPA fallback reads <current>/app.html
#
# Why a pool: asset filenames are content-hashed, so files from different
# releases coexist without collision. Stale tabs that dynamic-import a
# chunk see their hashed filename in the pool until a future prune wipes
# old entries. The Go server serves /_expo/static/ and /assets/ from
# _static/ directly — there is no per-request release lookup.
promote_release() {
    staging_dir=/app/release-staging
    releases_dir=/app/releases
    pool_dir="$releases_dir/_static"

    echo "[entrypoint] promote_release: staging=$staging_dir releases=$releases_dir"
    echo "[entrypoint] staging contents:"
    ls -la "$staging_dir" 2>&1 | sed 's/^/[entrypoint]   /' || true
    echo "[entrypoint] releases volume contents (before):"
    ls -la "$releases_dir" 2>&1 | sed 's/^/[entrypoint]   /' || true

    [ -d "$staging_dir" ] || {
        echo "[entrypoint] WARN: $staging_dir missing; skipping release promotion (SPA fallback will 404)"
        return 0
    }

    mkdir -p "$releases_dir" "$pool_dir/_expo/static" "$pool_dir/assets"

    release_id=""
    for d in "$staging_dir"/*/; do
        [ -d "$d" ] || continue
        if [ -f "$d/release-id.txt" ]; then
            release_id=$(cat "$d/release-id.txt")
            echo "[entrypoint] found release-id.txt in $d -> '$release_id'"
            break
        else
            echo "[entrypoint] WARN: $d has no release-id.txt"
        fi
    done

    if [ -z "$release_id" ]; then
        echo "[entrypoint] ERROR: no release-id.txt found under $staging_dir; aborting"
        exit 1
    fi

    src="$staging_dir/$release_id"
    dst="$releases_dir/$release_id"

    # Merge this release's asset trees into the cross-release pool.
    # cp -a (no -n) is used deliberately: same hashed filename = same
    # content, so re-copying is a no-op in effect; for the handful of
    # unhashed names under assets/ (app-icon.png, app-splash.png), the
    # current release's copy wins, which is the desired behavior. The
    # whole tree is a few MB so the redundant rewrites cost nothing.
    if [ -d "$src/_expo/static" ]; then
        echo "[entrypoint] merging _expo/static into pool"
        cp -a "$src/_expo/static/." "$pool_dir/_expo/static/"
    fi
    if [ -d "$src/assets" ]; then
        echo "[entrypoint] merging assets into pool"
        cp -a "$src/assets/." "$pool_dir/assets/"
    fi

    # Treat a previously-promoted dst as valid only if it has app.html.
    # If a prior boot left a half-promoted tree (interrupted copy, etc.),
    # the [ -d "$dst" ] check below would skip and reuse the corrupt
    # tree; this guard wipes it so the next attempt re-promotes cleanly.
    if [ -d "$dst" ] && [ ! -f "$dst/app.html" ]; then
        echo "[entrypoint] WARN: $dst exists but app.html is missing; clearing for re-promote"
        rm -rf "$dst"
    fi

    if [ ! -d "$dst" ]; then
        echo "[entrypoint] promoting release $release_id ($src -> $dst, app.html + release-id.txt only)"
        rm -rf "$dst.tmp"
        mkdir "$dst.tmp"
        cp -a "$src/app.html" "$dst.tmp/"
        cp -a "$src/release-id.txt" "$dst.tmp/"
        mv "$dst.tmp" "$dst"
        echo "[entrypoint] promotion complete; size=$(du -sh "$dst" 2>/dev/null | cut -f1)"
    else
        echo "[entrypoint] release $release_id already on volume; skipping per-release copy"
    fi

    # Atomic symlink swap: write to current.tmp, then mv -T over current.
    ln -sfn "$release_id" "$releases_dir/current.tmp"
    mv -T "$releases_dir/current.tmp" "$releases_dir/current"
    echo "[entrypoint] current -> $(readlink "$releases_dir/current")"

    if [ -f "$releases_dir/current/app.html" ]; then
        echo "[entrypoint] app.html present ($(wc -c < "$releases_dir/current/app.html") bytes)"
    else
        echo "[entrypoint] ERROR: $releases_dir/current/app.html missing — SPA fallback will 404"
        ls -la "$releases_dir/current/" 2>&1 | sed 's/^/[entrypoint]   /' || true
        exit 1
    fi

    pool_size=$(du -sh "$pool_dir" 2>/dev/null | cut -f1)
    echo "[entrypoint] pool size: $pool_size"
}

promote_release

# Build serve arguments
if [ -n "$SERVE_ON_DOMAINS" ]; then
    echo "Running on $SERVE_ON_DOMAINS"
    ARGS="$SERVE_ON_DOMAINS --http --https"
else
    ARGS="--http=0.0.0.0:7090"
fi

# Restart loop: exit code 75 signals a package install restart request
while true; do
    ./tinycld serve $ARGS
    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 75 ]; then
        echo "[entrypoint] Restart requested (exit code 75)"

        # Health check: start new binary on a temp port, verify /api/health responds
        ./tinycld serve --http=127.0.0.1:${HEALTH_PORT} &
        HEALTH_PID=$!

        HEALTHY=false
        for i in 1 2 3 4 5 6 7 8 9 10; do
            if curl -sf http://127.0.0.1:${HEALTH_PORT}/api/health >/dev/null 2>&1; then
                HEALTHY=true
                break
            fi
            sleep 1
        done

        kill $HEALTH_PID 2>/dev/null
        wait $HEALTH_PID 2>/dev/null || true

        if [ "$HEALTHY" = "true" ]; then
            echo "[entrypoint] Health check passed, restarting server"
            continue
        else
            echo "[entrypoint] Health check failed, attempting rollback"
            if [ -f ./tinycld.prev ]; then
                mv ./tinycld ./tinycld.failed
                mv ./tinycld.prev ./tinycld
                echo "[entrypoint] Rolled back to previous binary"
            fi
            continue
        fi
    fi

    # Normal exit (not a restart request)
    echo "[entrypoint] Server exited with code $EXIT_CODE"
    exit $EXIT_CODE
done
