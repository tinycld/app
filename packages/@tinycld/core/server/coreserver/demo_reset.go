package coreserver

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase"
)

// Defaults for the nightly demo reset job. Override via env vars at runtime —
// production sets DEMO_RESET_ENABLED=1 in the container; dev environments
// leave it unset so the job is dormant on developer machines.
const (
	defaultDemoResetSchedule = "0 4 * * *"   // 04:00 server time, daily
	demoResetJobID           = "demoReset"
	demoResetTimeout         = 15 * time.Minute
)

// resetMu prevents overlapping runs if a previous reset is still in flight
// when the next tick fires. The reset re-runs every package's seed, which
// can take a couple minutes on a populated workspace, so a missed firing is
// acceptable; concurrent runs are not.
var resetMu sync.Mutex

// RegisterDemoReset wires a nightly cron job that wipes and re-seeds the
// singleton demo workspace. The job shells out to scripts/reset-demo.ts via
// bun, which already lives in the runtime image and has all node_modules and
// generated package wiring available.
//
// The job is opt-in: it only registers when DEMO_RESET_ENABLED is set to a
// truthy value ("1", "true"). The schedule defaults to 04:00 UTC daily and
// can be overridden with DEMO_RESET_SCHEDULE (standard 5-field cron).
func RegisterDemoReset(app *pocketbase.PocketBase) {
	if !demoResetEnabled() {
		return
	}

	schedule := os.Getenv("DEMO_RESET_SCHEDULE")
	if schedule == "" {
		schedule = defaultDemoResetSchedule
	}

	app.Cron().MustAdd(demoResetJobID, schedule, func() {
		runDemoReset(app)
	})
	app.Logger().Info("demo reset cron registered", "schedule", schedule)
}

func demoResetEnabled() bool {
	v := os.Getenv("DEMO_RESET_ENABLED")
	return v == "1" || v == "true" || v == "TRUE"
}

func runDemoReset(app *pocketbase.PocketBase) {
	if !resetMu.TryLock() {
		app.Logger().Warn("demo reset skipped: previous run still in flight")
		return
	}
	defer resetMu.Unlock()

	scriptDir := resolveAppDir()
	ctx, cancel := context.WithTimeout(context.Background(), demoResetTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "bun", "run", "scripts/reset-demo.ts")
	cmd.Dir = scriptDir
	// Pass through env so ADMIN_USER_LOGIN / ADMIN_USER_PW configured for the
	// container reach the script. The script defaults to localhost:7090,
	// which is where the PB server is listening inside the container.
	cmd.Env = os.Environ()

	app.Logger().Info("demo reset starting", "dir", scriptDir)
	out, err := cmd.CombinedOutput()
	if err != nil {
		app.Logger().Error("demo reset failed", "err", err, "output", string(out))
		return
	}
	app.Logger().Info("demo reset succeeded", "output", string(out))
}

// resolveAppDir returns the directory that contains scripts/, package.json,
// and node_modules/. In the production container this is /app (next to the
// binary); during local dev the binary is built inside server/, so we walk
// up one level.
func resolveAppDir() string {
	ex, err := os.Executable()
	if err != nil {
		return "."
	}
	binDir := filepath.Dir(ex)
	if _, err := os.Stat(filepath.Join(binDir, "scripts", "reset-demo.ts")); err == nil {
		return binDir
	}
	parent := filepath.Dir(binDir)
	if _, err := os.Stat(filepath.Join(parent, "scripts", "reset-demo.ts")); err == nil {
		return parent
	}
	return binDir
}
