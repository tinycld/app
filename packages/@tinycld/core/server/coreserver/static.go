package coreserver

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// DefaultPublicDir returns the default public dir relative to the running
// executable — "./public" when running via `go run` (tempdir binary) or
// next to the installed binary otherwise.
func DefaultPublicDir() string {
	if strings.HasPrefix(os.Args[0], os.TempDir()) {
		return "./public"
	}
	return filepath.Join(os.Args[0], "../public")
}

// DefaultReleasesDir returns the default releases dir relative to the
// running executable — "./releases" when running via `go run` (tempdir
// binary) or next to the installed binary otherwise. The runtime
// entrypoint promotes per-deploy bundles into this directory; a `current`
// symlink there points at the active release.
func DefaultReleasesDir() string {
	if strings.HasPrefix(os.Args[0], os.TempDir()) {
		return "./releases"
	}
	return filepath.Join(os.Args[0], "../releases")
}

// DefaultTypesDir returns the default location the server writes generated
// pbSchema.ts / pbZodSchema.ts to, relative to the running executable.
// Writes into core's types/ alongside app-generated.d.ts.
func DefaultTypesDir() string {
	if strings.HasPrefix(os.Args[0], os.TempDir()) {
		return "../packages/@tinycld/core/types"
	}
	return filepath.Join(os.Args[0], "../../packages/@tinycld/core/types")
}

// StaticWithFallback serves static files from dir, falling back to
// fallbackFile for missing paths (so SPA routing works).
func StaticWithFallback(dir string, fallbackFile string) func(*core.RequestEvent) error {
	fs := os.DirFS(dir)

	return func(e *core.RequestEvent) error {
		// Only serve static files for GET/HEAD — let WebDAV methods pass through
		if e.Request.Method != http.MethodGet && e.Request.Method != http.MethodHead {
			return e.Next()
		}

		path := e.Request.PathValue("path")
		if path == "" {
			path = "index.html"
		}

		f, err := fs.Open(path)
		if err == nil {
			f.Close()
			return e.FileFS(fs, path)
		}

		indexPath := path + "/index.html"
		f, err = fs.Open(indexPath)
		if err == nil {
			f.Close()
			return e.FileFS(fs, indexPath)
		}

		if fallbackFile != "" {
			return e.FileFS(fs, fallbackFile)
		}

		return e.NotFoundError("", nil)
	}
}

// StaticWithDynamicFallback serves static files from publicDir (the
// marketing website + any other in-image content), and on miss falls back
// to <releasesDir>/current/app.html (the SPA shell from the active
// release).
//
// When releasesDir is empty or its `current` symlink doesn't resolve to a
// readable app.html, the handler falls back to publicDir/app.html — the
// legacy behavior used in dev where the volume isn't mounted. Any path
// not present in either location returns 404.
func StaticWithDynamicFallback(publicDir, releasesDir string) func(*core.RequestEvent) error {
	publicFs := os.DirFS(publicDir)

	return func(e *core.RequestEvent) error {
		if e.Request.Method != http.MethodGet && e.Request.Method != http.MethodHead {
			return e.Next()
		}

		path := e.Request.PathValue("path")
		if path == "" {
			path = "index.html"
		}

		if f, err := publicFs.Open(path); err == nil {
			f.Close()
			return e.FileFS(publicFs, path)
		}

		indexPath := path + "/index.html"
		if f, err := publicFs.Open(indexPath); err == nil {
			f.Close()
			return e.FileFS(publicFs, indexPath)
		}

		// SPA fallback. Set no-store on app.html so a tab reload always
		// pulls the active release's shell rather than a cached copy that
		// may reference asset hashes the client has since dropped.
		if releasesDir != "" {
			currentApp := filepath.Join(releasesDir, "current", "app.html")
			if data, err := os.ReadFile(currentApp); err == nil {
				e.Response.Header().Set("Cache-Control", "no-store")
				e.Response.Header().Set("Content-Type", "text/html; charset=utf-8")
				_, _ = e.Response.Write(data)
				return nil
			}
		}

		// Dev fallback: publicDir/app.html.
		if f, err := publicFs.Open("app.html"); err == nil {
			f.Close()
			e.Response.Header().Set("Cache-Control", "no-store")
			return e.FileFS(publicFs, "app.html")
		}

		return e.NotFoundError("", nil)
	}
}
