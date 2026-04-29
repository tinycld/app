package coreserver

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/hook"

	"tinycld.org/core/notify"
)

// Options configure the core server's registered plugins, flags, and wiring.
// A runnable `main` package builds this struct and calls Register(app, opts).
type Options struct {
	// HTTP server
	PublicDir    string
	FallbackFile string

	// Schema generation
	TypesDir string

	// JS hooks / migrations plugins
	HooksDir      string
	HooksWatch    bool
	HooksPoolSize int
	MigrationsDir string
	Automigrate   bool

	// BinaryName is the file name of the running app binary (without
	// directory). Used by package install/upgrade flows to locate the
	// existing binary for migrate-and-swap operations. Defaults to
	// `filepath.Base(os.Args[0])` when empty.
	BinaryName string

	// RegisterExtras is called after core's own registrations. Use it to inject
	// code that lives outside this package — in particular, the generator's
	// `registerPackageExtensions(app)` which wires sibling package servers.
	RegisterExtras func(app *pocketbase.PocketBase)
}

// binaryName holds the resolved app binary name (set by Register()).
// Package-internal helpers in pkg_install.go and pkg_go_build.go read it to
// locate the running binary on disk. Default `tinycld` matches the original
// app; production callers should set Options.BinaryName.
var binaryName = "tinycld"

// Register configures a pocketbase.PocketBase app with all of core's
// server-side behavior: jsvm, migratecmd, notifications, invites, audit,
// package management, setup bootstrap, account deletion, schema generation,
// and static file serving.
//
// Callers provide the `app` (so they can build it with their own Sentry/env
// setup) and Options. Run `app.Start()` after this returns.
func Register(app *pocketbase.PocketBase, opts Options) {
	if opts.BinaryName != "" {
		binaryName = opts.BinaryName
	} else if len(os.Args) > 0 {
		// Fall back to the running executable's basename. Strips ".test"
		// in test contexts so package-install code paths still see a
		// production-shaped name (purely cosmetic).
		base := filepath.Base(os.Args[0])
		if base != "" && base != "." && base != "/" {
			binaryName = base
		}
	}

	registerFlags(app, &opts)

	// Parse CLI args so flag-backed fields are populated before we register
	// plugins that read them (jsvm, migratecmd).
	_ = app.RootCmd.ParseFlags(os.Args[1:])

	jsvm.MustRegister(app, jsvm.Config{
		MigrationsDir: opts.MigrationsDir,
		HooksDir:      opts.HooksDir,
		HooksWatch:    opts.HooksWatch,
		HooksPoolSize: opts.HooksPoolSize,
	})

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		TemplateLang: migratecmd.TemplateLangJS,
		Automigrate:  opts.Automigrate,
		Dir:          opts.MigrationsDir,
	})

	if opts.RegisterExtras != nil {
		opts.RegisterExtras(app)
	}

	notify.Register(app)
	RegisterInviteEndpoint(app)
	RegisterInviteLinkEndpoints(app)
	RegisterInviteLifecycle(app)
	RegisterAuditHooks(app)
	RegisterOrgPkgEnabledHooks(app)
	RegisterPackageInstallEndpoints(app)
	RegisterSetupBootstrap(app)
	RegisterAccountDelete(app)
	RegisterDemoStart(app)
	RegisterDemoReset(app)
	RegisterUsersFieldGuard(app)
	RegisterUsersDemoAuditHook(app)

	registerSchemaHooks(app, opts.TypesDir)
	registerStaticServe(app, opts)
}

// registerFlags binds the persistent CLI flags shared by every tinycld server.
// Option fields are used as defaults; the user can override via --flag.
func registerFlags(app *pocketbase.PocketBase, opts *Options) {
	f := app.RootCmd.PersistentFlags()
	f.StringVar(&opts.HooksDir, "hooksDir", opts.HooksDir, "the directory with the JS app hooks")
	f.BoolVar(&opts.HooksWatch, "hooksWatch", opts.HooksWatch,
		"auto restart the app on pb_hooks file change; it has no effect on Windows")
	f.IntVar(&opts.HooksPoolSize, "hooksPool", opts.HooksPoolSize,
		"the total prewarm goja.Runtime instances for the JS app hooks execution")
	f.StringVar(&opts.MigrationsDir, "migrationsDir", opts.MigrationsDir,
		"the directory with the user defined migrations")
	f.BoolVar(&opts.Automigrate, "automigrate", opts.Automigrate, "enable/disable auto migrations")
	f.StringVar(&opts.PublicDir, "publicDir", opts.PublicDir, "the directory to serve static files")
	f.StringVar(&opts.FallbackFile, "fallbackFile", opts.FallbackFile,
		"fallback to this file on missing static path for SPA routes")
	f.StringVar(&opts.TypesDir, "typesDir", opts.TypesDir,
		"the directory to write generated TypeScript schema files")
}

func registerSchemaHooks(app *pocketbase.PocketBase, typesDir string) {
	app.OnCollectionCreateRequest().BindFunc(func(e *core.CollectionRequestEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		GenerateSchemas(e.App, typesDir)
		return nil
	})

	app.OnCollectionUpdateRequest().BindFunc(func(e *core.CollectionRequestEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		GenerateSchemas(e.App, typesDir)
		return nil
	})

	app.OnCollectionDeleteRequest().BindFunc(func(e *core.CollectionRequestEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		GenerateSchemas(e.App, typesDir)
		return nil
	})
}

func registerStaticServe(app *pocketbase.PocketBase, opts Options) {
	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{
		Func: func(e *core.ServeEvent) error {
			GenerateSchemas(e.App, opts.TypesDir)
			SyncBundledPackages(e.App)

			if !e.Router.HasRoute(http.MethodGet, "/{path...}") {
				e.Router.Any("/{path...}", StaticWithFallback(opts.PublicDir, opts.FallbackFile))
			}

			return e.Next()
		},
		Priority: 999,
	})
}
