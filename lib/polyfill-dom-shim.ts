// Some dependency in our Expo SDK 55 + RN 0.83 stack now installs a
// partial `document` object on Hermes — `typeof document === 'object'`
// but `document.documentElement` is `undefined`. That confuses
// `prosemirror-view`'s top-level browser sniff, which evaluates
//   const webkit = !!doc && "webkitFontSmoothing" in doc.documentElement.style
// at module-init time and throws "Cannot read property 'style' of undefined".
//
// We don't yet know which dep is doing the partial polyfill, but the
// fix is the same either way: ensure `document.documentElement.style`
// exists. The shim only fills missing fields, so a real DOM (web) is
// untouched.

interface MutableDoc {
    documentElement?: { style?: Record<string, unknown> }
}

const g = globalThis as unknown as { document?: MutableDoc }

if (typeof g.document === 'object' && g.document !== null) {
    if (!g.document.documentElement) {
        g.document.documentElement = { style: {} }
    } else if (!g.document.documentElement.style) {
        g.document.documentElement.style = {}
    }
}
