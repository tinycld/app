// Native stub: the real react-pdf-based viewer lives in PdfCanvasViewer.web.tsx
// and pulls pdfjs-dist, which uses `import.meta.url` (a Node feature Hermes
// doesn't support). Pairing this empty native variant with the .web variant
// keeps Metro from following pdfjs-dist into native bundles even though
// PdfPreview's Platform.OS guard already prevents runtime use.
export function PdfCanvasViewer(_: { url: string }) {
    return null
}
