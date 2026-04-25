package main

import (
	"log"
	"os"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/pocketbase/pocketbase"

	"tinycld.org/core/coreserver"
)

// defaultHTTPAddr is the loopback address tinycld serves on in dev when no
// --http flag is given. The local-ssl-proxy in `bun run dev` listens on 7090
// and forwards here, so this needs to match the SSL proxy's --target port.
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

	// Default --http to defaultHTTPAddr when running `serve` without an
	// explicit address and no domain args. PocketBase's autocert needs
	// :80/:443 when domain args are present, so we don't override there.
	// PB's own default for `serve` is 127.0.0.1:8090 — we override to 7090
	// to match the SSL proxy in `bun run dev`. Injecting through os.Args
	// (rather than registering a flag default) keeps PB's flag schema
	// untouched and lets explicit `--http :8090` overrides still work.
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
		BinaryName:     "tinycld",
		HooksWatch:     true,
		HooksPoolSize:  15,
		Automigrate:    true,
		RegisterExtras: registerPackageExtensions,
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
