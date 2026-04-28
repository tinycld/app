package thumbnails

import (
	"fmt"
	"image/jpeg"
	"os"
	"strings"
	"sync"

	"github.com/disintegration/imaging"
	"github.com/gen2brain/go-fitz"
)

// DefaultWidth is the default thumbnail width.
const DefaultWidth = 480

// DefaultHeight is the default thumbnail height.
const DefaultHeight = 360

// fitzMu serializes all go-fitz (mupdf CGo) operations.
// MuPDF is not thread-safe, so concurrent calls cause SIGSEGV.
var fitzMu sync.Mutex

// supportedMimeTypes lists MIME types that go-fitz can render.
var supportedMimeTypes = []string{
	"application/pdf",
	"application/epub+zip",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"application/vnd.ms-word",
	"application/vnd.ms-excel",
	"application/vnd.ms-powerpoint",
	"application/msword",
}

// CanGenerate reports whether a thumbnail can be generated for the given MIME type.
// Images are handled by PocketBase's built-in ?thumb= parameter, so they are excluded here.
func CanGenerate(mimeType string) bool {
	mt := strings.ToLower(strings.TrimSpace(mimeType))
	for _, supported := range supportedMimeTypes {
		if mt == supported {
			return true
		}
	}
	return false
}

// Generate renders the first page of the document at inputPath as a JPEG thumbnail
// and writes it to outputPath. The thumbnail is resized to fit within width x height
// while preserving aspect ratio.
func Generate(inputPath, outputPath string, width, height int) error {
	fitzMu.Lock()
	defer fitzMu.Unlock()

	doc, err := fitz.New(inputPath)
	if err != nil {
		return fmt.Errorf("thumbnails: failed to open document: %w", err)
	}
	defer doc.Close()

	img, err := doc.Image(0)
	if err != nil {
		return fmt.Errorf("thumbnails: failed to render page: %w", err)
	}

	thumb := imaging.Fit(img, width, height, imaging.Lanczos)

	out, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("thumbnails: failed to create output file: %w", err)
	}
	defer out.Close()

	if err := jpeg.Encode(out, thumb, &jpeg.Options{Quality: 85}); err != nil {
		return fmt.Errorf("thumbnails: failed to encode JPEG: %w", err)
	}

	return nil
}
