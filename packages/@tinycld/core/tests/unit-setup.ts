import { vi } from 'vitest'

process.env.EXPO_PUBLIC_ENV ??= 'test'

vi.mock('@sentry/react-native', () => ({
    init: vi.fn(),
    captureException: vi.fn(),
    withScope: vi.fn(),
}))

// React Native's entry uses Flow syntax Vite/Rollup can't parse. Substitute
// the tiny surface our shortcut-layer tests touch.
vi.mock('react-native', () => ({
    Platform: { OS: 'web' },
    Dimensions: {
        get: () => ({ width: 1024, height: 768 }),
        addEventListener: () => ({ remove: () => {} }),
    },
}))

vi.mock('expo-router', () => ({
    router: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
    Slot: () => null,
    Redirect: () => null,
    usePathname: () => '/',
    useLocalSearchParams: () => ({}),
}))

// @tinycld/app-generated/* is provided by the runnable app shell at
// build time. In core's standalone test environment there's no app, so
// shim each generated module to its empty default. Types come from the
// ambient declaration in types/app-generated.d.ts.
vi.mock('@tinycld/app-generated/package-registry', () => ({
    packageRegistry: [],
}))
vi.mock('@tinycld/app-generated/package-collections', () => ({
    packageStores: () => ({}),
}))
vi.mock('@tinycld/app-generated/package-providers', () => ({
    packageProviders: {},
}))
vi.mock('@tinycld/app-generated/package-sidebars', () => ({
    packageSidebars: {},
}))
vi.mock('@tinycld/app-generated/package-settings', () => ({
    packageSettings: [],
}))
vi.mock('@tinycld/app-generated/package-seeds', () => ({
    packageSeeds: {},
}))

// @react-native-async-storage/async-storage requires the RN module bridge and
// is pulled in transitively by `~/lib/store`. Substitute a minimal in-memory
// shim so tests can exercise the Zustand registry without RN.
vi.mock('@react-native-async-storage/async-storage', () => {
    const store = new Map<string, string>()
    const api = {
        getItem: async (key: string) => store.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            store.set(key, value)
        },
        removeItem: async (key: string) => {
            store.delete(key)
        },
        clear: async () => {
            store.clear()
        },
        getAllKeys: async () => Array.from(store.keys()),
        multiGet: async (keys: string[]) => keys.map(k => [k, store.get(k) ?? null]),
        multiSet: async (pairs: [string, string][]) => {
            for (const [k, v] of pairs) store.set(k, v)
        },
        multiRemove: async (keys: string[]) => {
            for (const k of keys) store.delete(k)
        },
    }
    return { default: api, ...api }
})
