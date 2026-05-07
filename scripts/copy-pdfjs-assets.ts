import * as fs from 'node:fs'
import * as path from 'node:path'

// Copy the runtime assets that PdfCanvasViewer.web.tsx loads at runtime
// (the pdfjs worker .mjs and react-pdf's text/annotation layer CSS) into
// public/workers/pdfcanvas/. Files there are auto-served at the matching
// URL by Expo's web build. Output is gitignored — it always tracks the
// installed package versions.

const ROOT = path.resolve(import.meta.dirname, '..')
const NODE_MODULES = path.join(ROOT, 'node_modules')
const DEST = path.join(ROOT, 'public', 'workers', 'pdfcanvas')

const assets = [
    {
        from: path.join(NODE_MODULES, 'pdfjs-dist/build/pdf.worker.min.mjs'),
        to: path.join(DEST, 'pdf.worker.min.mjs'),
    },
    {
        from: path.join(NODE_MODULES, 'react-pdf/dist/Page/TextLayer.css'),
        to: path.join(DEST, 'react-pdf-text-layer.css'),
    },
    {
        from: path.join(NODE_MODULES, 'react-pdf/dist/Page/AnnotationLayer.css'),
        to: path.join(DEST, 'react-pdf-annotation-layer.css'),
    },
]

fs.mkdirSync(DEST, { recursive: true })
for (const { from, to } of assets) {
    if (!fs.existsSync(from)) {
        throw new Error(`copy-pdfjs-assets: source missing: ${from}`)
    }
    fs.copyFileSync(from, to)
}
