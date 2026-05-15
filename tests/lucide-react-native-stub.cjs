// Test-only stub for `lucide-react-native`. The real bundle pulls
// in `react-native-svg`, whose source uses TypeScript syntax that
// Vitest's transformer doesn't apply to node_modules. We don't
// render icons in unit tests anyway — assertions about icon
// rendering belong in Playwright.
//
// Implemented as CJS (.cjs) so we can use a Proxy on module.exports.
// Any named-icon import (ExternalLink, AlertTriangle, …) yields the
// same harmless component stub. Tests that genuinely need a real
// icon should reach for vi.mock locally; this stub only exists so
// the module graph can finish loading from sibling source under
// packages/@tinycld/<sibling>/... where the real bundle would crash.

const Stub = () => null

module.exports = new Proxy(
    { default: Stub },
    {
        get(target, prop) {
            if (prop === 'default') return Stub
            if (prop === '__esModule') return true
            if (typeof prop === 'symbol') return Reflect.get(target, prop)
            return Stub
        },
    }
)
