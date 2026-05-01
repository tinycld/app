package coreserver

import (
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// setupReleasesDir creates a temp directory shaped like a real releases tree:
//
//	<tmp>/
//	    2026-05-01-143022-abc1234/
//	        _expo/static/js/web/bundle.js
//	        release-id.txt
//	        app.html
//	    2026-04-01-100000-def5678/
//	        _expo/static/js/web/bundle.js
//	        release-id.txt
//	        app.html
//	    current -> 2026-05-01-143022-abc1234  (symlink)
func setupReleasesDir(t *testing.T) (releasesDir string, firstRelease string) {
	t.Helper()
	releasesDir = t.TempDir()

	releases := []string{
		"2026-05-01-143022-abc1234",
		"2026-04-01-100000-def5678",
	}

	for _, id := range releases {
		bundleDir := filepath.Join(releasesDir, id, "_expo", "static", "js", "web")
		if err := os.MkdirAll(bundleDir, 0o755); err != nil {
			t.Fatalf("MkdirAll %s: %v", bundleDir, err)
		}
		if err := os.WriteFile(filepath.Join(bundleDir, "bundle.js"), []byte("// bundle for "+id), 0o644); err != nil {
			t.Fatalf("WriteFile bundle.js: %v", err)
		}
		if err := os.WriteFile(filepath.Join(releasesDir, id, "release-id.txt"), []byte(id), 0o644); err != nil {
			t.Fatalf("WriteFile release-id.txt: %v", err)
		}
		if err := os.WriteFile(filepath.Join(releasesDir, id, "app.html"), []byte("<html>"+id+"</html>"), 0o644); err != nil {
			t.Fatalf("WriteFile app.html: %v", err)
		}
	}

	if err := os.Symlink(releases[0], filepath.Join(releasesDir, "current")); err != nil {
		t.Fatalf("Symlink current: %v", err)
	}

	return releasesDir, releases[0]
}

// runVersionedAssetsScenario boots a TestApp with the VersionedAssets handler
// mounted at GET /v/{releaseId}/{path...} and drives the given ApiScenario.
func runVersionedAssetsScenario(t *testing.T, releasesDir string, scenario *tests.ApiScenario) {
	t.Helper()

	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	defer app.Cleanup()

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.RouterGroup.GET("/v/{releaseId}/{path...}", VersionedAssets(releasesDir))
		return e.Next()
	})

	scenario.TestAppFactory = func(_ testing.TB) *tests.TestApp { return app }
	scenario.DisableTestAppCleanup = true
	scenario.Test(t)
}

// callVersionedAssets is a convenience wrapper: builds a tiny router bound to
// VersionedAssets, fires a GET for the given releaseId + path, and returns the
// HTTP status and the Cache-Control header from the response.
//
// Used by tests that need to inspect headers directly (ApiScenario only
// supports body / status assertions).
func callVersionedAssets(t *testing.T, releasesDir, releaseId, path string) *http.Response {
	t.Helper()

	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	defer app.Cleanup()

	var captured *http.Response

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.RouterGroup.GET("/v/{releaseId}/{path...}", VersionedAssets(releasesDir))
		return e.Next()
	})

	scenario := &tests.ApiScenario{
		Method:                http.MethodGet,
		URL:                   "/v/" + releaseId + "/" + path,
		ExpectedStatus:        http.StatusOK,
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return app },
		DisableTestAppCleanup: true,
		AfterTestFunc: func(_ testing.TB, _ *tests.TestApp, res *http.Response) {
			captured = res
		},
	}
	scenario.Test(t)

	return captured
}

func TestVersionedAssets_ServesExistingFile(t *testing.T) {
	releasesDir, firstRelease := setupReleasesDir(t)

	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	defer app.Cleanup()

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.RouterGroup.GET("/v/{releaseId}/{path...}", VersionedAssets(releasesDir))
		return e.Next()
	})

	scenario := &tests.ApiScenario{
		Name:                  "serves existing bundle.js with correct headers",
		Method:                http.MethodGet,
		URL:                   "/v/" + firstRelease + "/_expo/static/js/web/bundle.js",
		ExpectedStatus:        http.StatusOK,
		ExpectedContent:       []string{"// bundle for " + firstRelease},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return app },
		DisableTestAppCleanup: true,
		AfterTestFunc: func(t testing.TB, _ *tests.TestApp, res *http.Response) {
			cc := res.Header.Get("Cache-Control")
			if cc != "public, max-age=31536000, immutable" {
				t.Errorf("Cache-Control = %q, want %q", cc, "public, max-age=31536000, immutable")
			}
		},
	}
	scenario.Test(t)
}

func TestVersionedAssets_404OnMissingRelease(t *testing.T) {
	releasesDir, _ := setupReleasesDir(t)

	runVersionedAssetsScenario(t, releasesDir, &tests.ApiScenario{
		Name:           "unknown release id returns 404",
		Method:         http.MethodGet,
		URL:            "/v/2099-01-01-000000-aaa0000/_expo/static/js/web/bundle.js",
		ExpectedStatus: http.StatusNotFound,
	})
}

func TestVersionedAssets_404OnMissingFile(t *testing.T) {
	releasesDir, firstRelease := setupReleasesDir(t)

	runVersionedAssetsScenario(t, releasesDir, &tests.ApiScenario{
		Name:           "release exists but file is absent returns 404",
		Method:         http.MethodGet,
		URL:            "/v/" + firstRelease + "/_expo/static/js/web/does-not-exist.js",
		ExpectedStatus: http.StatusNotFound,
	})
}

func TestVersionedAssets_RejectsInvalidReleaseId(t *testing.T) {
	releasesDir, _ := setupReleasesDir(t)

	// ".." is the canonical path-traversal probe. The handler must reject it
	// before touching the filesystem — otherwise an attacker could read files
	// outside the releases directory.
	runVersionedAssetsScenario(t, releasesDir, &tests.ApiScenario{
		Name:           "path traversal probe is rejected with 404",
		Method:         http.MethodGet,
		URL:            "/v/../_expo/static/js/web/bundle.js",
		ExpectedStatus: http.StatusNotFound,
	})
}

// Compile-time assertion: VersionedAssets must have the correct signature.
// This is intentionally unreachable code — the blank identifier assignment
// forces the compiler to type-check the expression without running it.
var _ func(*core.RequestEvent) error = VersionedAssets("")
