#!/bin/sh
set -e

HEALTH_PORT=19876

# Build serve arguments
if [ -n "$SERVE_ON_DOMAINS" ]; then
    echo "Running on $SERVE_ON_DOMAINS"
    ARGS="$SERVE_ON_DOMAINS --debug --http --https"
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
