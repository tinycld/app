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
