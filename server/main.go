package main

import (
	"log"
	"os"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/pocketbase/pocketbase"

	"tinycld.org/core/coreserver"
)

const defaultHTTPAddr = "127.0.0.1:7090"

// main composes the tinycld app server: load env, init Sentry, build the
// shared core server via coreserver.Register, then start PocketBase.
//
// registerPackageExtensions is generator output (see scripts/generate-packages.ts
// → server/package_extensions.go). It's declared in this same package so we
// can hand it to coreserver.Options.RegisterExtras without a cross-package
// generated-import dance.
func main() {
	coreserver.LoadEnvFile()

	// Default --http to 7090 when running `serve` without an explicit address
	// and no domain args (autocert needs :80/:443 for Let's Encrypt).
	if coreserver.HasSubcommand("serve") && !coreserver.HasFlag("--http") && !coreserver.HasDomainArgs() {
		os.Args = append(os.Args, "--http", defaultHTTPAddr)
	}

	if err := sentry.Init(sentry.ClientOptions{
		Dsn:              os.Getenv("SENTRY_DSN"),
		Environment:      coreserver.GetEnvironment(),
		TracesSampleRate: 0.2,
		AttachStacktrace: true,
	}); err != nil {
		log.Printf("Sentry initialization failed: %v", err)
	}
	defer sentry.Flush(2 * time.Second)

	app := pocketbase.New()
	coreserver.Register(app, coreserver.Options{
		PublicDir:      coreserver.DefaultPublicDir(),
		FallbackFile:   "app.html",
		TypesDir:       coreserver.DefaultTypesDir(),
		HooksWatch:     true,
		HooksPoolSize:  15,
		Automigrate:    true,
		RegisterExtras: registerPackageExtensions,
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
