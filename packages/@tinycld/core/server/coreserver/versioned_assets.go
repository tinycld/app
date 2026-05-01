package coreserver

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"

	"github.com/pocketbase/pocketbase/core"
)

// releaseIdRegex constrains the {releaseId} path value to the format
// produced by deploy/build.sh: YYYY-MM-DD-HHMMSS-<short-sha>. Anything
// else (including path-traversal probes like "..") returns 404 before we
// touch the filesystem.
var releaseIdRegex = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}-\d{6}-[a-f0-9]+$`)

// VersionedAssets serves files from <releasesDir>/<releaseId>/<path>.
// It is the handler bound to /v/{releaseId}/{path...}. Stale tabs whose
// release directory has been pruned receive a 404; their chunk-load
// error handler is expected to trigger a reload, which picks up the
// current release.
//
// All responses carry an immutable Cache-Control header — release
// directories never get rewritten in place, only created or pruned, so
// any URL that resolves successfully can be cached forever.
func VersionedAssets(releasesDir string) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if e.Request.Method != http.MethodGet && e.Request.Method != http.MethodHead {
			return e.Next()
		}

		releaseId := e.Request.PathValue("releaseId")
		path := e.Request.PathValue("path")

		if !releaseIdRegex.MatchString(releaseId) {
			return e.NotFoundError("", nil)
		}

		releaseDir := filepath.Join(releasesDir, releaseId)
		fs := os.DirFS(releaseDir)

		f, err := fs.Open(path)
		if err != nil {
			return e.NotFoundError("", nil)
		}
		f.Close()

		e.Response.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		return e.FileFS(fs, path)
	}
}
