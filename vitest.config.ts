import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        alias: [
            {
                find: /^react$/,
                replacement: path.resolve(__dirname, 'node_modules/react/index.js'),
            },
            {
                find: /^react\/jsx-runtime$/,
                replacement: path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
            },
            {
                find: /^react\/jsx-dev-runtime$/,
                replacement: path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js'),
            },
            {
                find: /^@tinycld\/core\/Providers$/,
                replacement: path.resolve(
                    __dirname,
                    'packages/@tinycld/core/components/Providers.tsx'
                ),
            },
            {
                find: /^@tinycld\/core$/,
                replacement: path.resolve(__dirname, 'packages/@tinycld/core/index.ts'),
            },
            {
                find: /^@tinycld\/core\/(.+)$/,
                replacement: path.resolve(__dirname, 'packages/@tinycld/core/$1'),
            },
            {
                find: /^@tinycld\/app-generated\/(.+)$/,
                replacement: path.resolve(__dirname, 'lib/generated/$1'),
            },
            { find: /^~\/(.+)$/, replacement: path.resolve(__dirname, '$1') },
            // expo-clipboard transitively pulls in expo-modules-core,
            // whose module-load-time side effects (touching `__DEV__`,
            // `expo` global, EventEmitter wiring) don't survive a
            // bare Node test environment. Tests that need clipboard
            // behaviour go through this small in-memory stub instead.
            {
                find: /^expo-clipboard$/,
                replacement: path.resolve(__dirname, 'tests/expo-clipboard-stub.ts'),
            },
            // expo-router's CJS entry does `require("./global")` at
            // module top, which Node's CJS resolver can't find when
            // the calling module is reached through a sibling-package
            // symlink (Vite SSR with the default preserveSymlinks=false
            // resolves the chain to the sibling's real filesystem
            // path, where node_modules don't reach expo-router).
            // Tests that load a real screen/hook/side-effect module
            // from a sibling go through this stub. tests/unit-setup.ts
            // also vi.mock('expo-router', ...) for the small set of
            // tests that import expo-router directly; both layers
            // overlap harmlessly.
            {
                find: /^expo-router$/,
                replacement: path.resolve(__dirname, 'tests/expo-router-stub.ts'),
            },
            // lucide-react-native pulls in react-native-svg, whose
            // source is TS and isn't transformed in node_modules under
            // Vitest. The stub is a CJS Proxy so any named icon import
            // (ExternalLink, AlertTriangle, …) yields a harmless
            // component stub.
            {
                find: /^lucide-react-native$/,
                replacement: path.resolve(__dirname, 'tests/lucide-react-native-stub.cjs'),
            },
            // yjs and y-protocols are stateful CRDT libs whose internal
            // type checks rely on instanceof. Without an alias, code
            // imported through the package symlinks (siblings) resolves
            // a separate copy of yjs from `node_modules`, and nested
            // Y.Map.set calls fail with "Unexpected content type" when
            // a Y.Map from one copy is set inside a Y.Map from another.
            // Force every import to the single root install.
            { find: /^yjs$/, replacement: path.resolve(__dirname, 'node_modules/yjs') },
            {
                find: /^y-protocols\/(.+)$/,
                replacement: path.resolve(__dirname, 'node_modules/y-protocols/$1'),
            },
        ],
    },
    test: {
        environment: 'node',
        include: [
            'tests/**/*.test.ts',
            'tests/**/*.test.tsx',
            'packages/*/tests/**/*.test.ts',
            'packages/*/tests/**/*.test.tsx',
            'packages/@*/*/tests/**/*.test.ts',
            'packages/@*/*/tests/**/*.test.tsx',
            'packages/@tinycld/core/**/__tests__/**/*.test.ts',
            'packages/@tinycld/core/**/__tests__/**/*.test.tsx',
            'packages/@tinycld/core/**/*.test.ts',
            'packages/@tinycld/core/**/*.test.tsx',
        ],
        exclude: [
            'packages/@tinycld/google-takeout-import/tests/worker-bridge.test.ts',
            'packages/@tinycld/core/ideas/**',
            'node_modules/**',
        ],
        setupFiles: ['tests/unit-setup.ts'],
    },
})
