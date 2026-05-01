package coreserver

import (
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
)

// RegisterSentry initializes the Sentry client and binds router middleware
// that captures returned handler errors, panics, and any 5xx response that
// reaches the client without producing an error value (e.g. handlers that
// write directly to ResponseWriter, like the go-webdav CalDAV library).
//
// Must run before any OnServe handlers register routes — middleware bound
// after a route is added does not apply to it. Register() calls this first.
//
// When SENTRY_DSN is empty the SDK still functions but events are dropped,
// so the middleware is a no-op in dev. The panic recovery still re-panics
// regardless, so PB's normal 500 response path is unaffected.
func RegisterSentry(app *pocketbase.PocketBase) {
	if err := sentry.Init(sentry.ClientOptions{
		Dsn:              os.Getenv("SENTRY_DSN"),
		Environment:      GetEnvironment(),
		TracesSampleRate: 0.2,
		AttachStacktrace: true,
	}); err != nil {
		log.Printf("Sentry initialization failed: %v", err)
	}

	registerSentryMiddlewareCore(app)
}

// registerSentryMiddlewareCore binds the per-request capture logic. Split
// from RegisterSentry so tests can drive it against tests.TestApp (core.App)
// without invoking the global Init.
func registerSentryMiddlewareCore(app core.App) {
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.BindFunc(sentryMiddleware)
		return e.Next()
	})
}

// sentrySkipPaths are request paths fully excluded from Sentry — no
// breadcrumbs and no error/5xx capture. Liveness and health probes hit
// often enough that a flapping dependency or a mid-rollout deploy would
// drown real signal otherwise. PB serves /api/health by default; other
// probe paths can be added at test time.
var sentrySkipPaths = map[string]bool{
	"/api/health": true,
}

func sentryMiddleware(re *core.RequestEvent) error {
	path := re.Request.URL.Path
	if sentrySkipPaths[path] {
		return re.Next()
	}

	hub := sentry.CurrentHub().Clone()
	ctx := sentry.SetHubOnContext(re.Request.Context(), hub)
	re.Request = re.Request.WithContext(ctx)

	method := re.Request.Method

	hub.Scope().SetTag("http.method", method)
	hub.Scope().SetTag("http.route", path)
	if re.Auth != nil {
		hub.Scope().SetUser(sentry.User{ID: re.Auth.Id})
	}

	defer func() {
		if r := recover(); r != nil {
			hub.RecoverWithContext(ctx, r)
			hub.Flush(2 * time.Second)
			panic(r)
		}
	}()

	err := re.Next()

	status := re.Status()

	hub.AddBreadcrumb(&sentry.Breadcrumb{
		Type:     "http",
		Category: "request",
		Data: map[string]any{
			"method": method,
			"path":   path,
			"status": status,
		},
		Level: sentry.LevelInfo,
	}, nil)

	if err != nil {
		var apiErr *router.ApiError
		if errors.As(err, &apiErr) && apiErr.Status < 500 {
			return err
		}
		captureErr := err
		if apiErr != nil {
			if raw, ok := apiErr.RawData().(error); ok {
				captureErr = raw
			}
		}
		hub.CaptureException(captureErr)
		return err
	}

	if status >= 500 {
		hub.WithScope(func(scope *sentry.Scope) {
			scope.SetLevel(sentry.LevelError)
			scope.SetTag("http.status", fmt.Sprintf("%d", status))
			hub.CaptureMessage(fmt.Sprintf("HTTP %d %s %s", status, method, path))
		})
	}

	return nil
}
