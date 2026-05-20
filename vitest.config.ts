import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        alias: [
            // --- dedup pins (Vite SSR resolver differs from Metro; keep until
            //     a test proves the workspace dedupes these on its own) ---
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
            // yjs/y-protocols use instanceof checks; a duplicate copy reached
            // through a member symlink breaks nested Y.Map.set ("Unexpected
            // content type"). Pin to the app shell's single install.
            { find: /^yjs$/, replacement: path.resolve(__dirname, 'node_modules/yjs') },
            {
                find: /^y-protocols\/(.+)$/,
                replacement: path.resolve(__dirname, 'node_modules/y-protocols/$1'),
            },
            // hyperformula's ESM build has broken relative imports under Vite
            // SSR; pin to the self-consistent commonjs entry.
            {
                find: /^hyperformula$/,
                replacement: path.resolve(__dirname, 'node_modules/hyperformula/commonjs/index.js'),
            },
            // --- @tinycld/core path remaps. Unlike Metro, Vite's exports-map
            //     resolution does NOT do directory-index fallback, so
            //     `@tinycld/core/lib/notify` (a dir → lib/notify/index.ts) fails
            //     to load through the exports wildcard. Remap straight to the
            //     bundled core path, which Vite resolves with its own extension
            //     + index probing. (Metro handles this natively — see Spike 1.)
            {
                find: /^@tinycld\/core\/Providers$/,
                replacement: path.resolve(__dirname, 'packages/@tinycld/core/components/Providers.tsx'),
            },
            {
                find: /^@tinycld\/core$/,
                replacement: path.resolve(__dirname, 'packages/@tinycld/core/index.ts'),
            },
            {
                find: /^@tinycld\/core\/(.+)$/,
                replacement: path.resolve(__dirname, 'packages/@tinycld/core/$1'),
            },
            // --- @tinycld/app-generated/* build-time contract (Phase 3 keeps a
            //     subset of generated files; Vitest doesn't read tsconfig paths) ---
            {
                find: /^@tinycld\/app-generated\/(.+)$/,
                replacement: path.resolve(__dirname, 'lib/generated/$1'),
            },
            // `~/*` → app shell root (unchanged from the pre-workspace config).
            { find: /^~\/(.+)$/, replacement: path.resolve(__dirname, '$1') },
            // --- test doubles (unrelated to linking) ---
            // expo-clipboard transitively pulls in expo-modules-core, whose
            // module-load-time side effects don't survive a bare Node test env.
            {
                find: /^expo-clipboard$/,
                replacement: path.resolve(__dirname, 'tests/expo-clipboard-stub.ts'),
            },
            // expo-router's CJS entry does `require("./global")` at module top,
            // which Node can't resolve when reached through a member symlink.
            {
                find: /^expo-router$/,
                replacement: path.resolve(__dirname, 'tests/expo-router-stub.ts'),
            },
            // lucide-react-native pulls in react-native-svg (TS source, not
            // transformed in node_modules under Vitest); a CJS Proxy stub
            // yields a harmless component for any named icon import.
            {
                find: /^lucide-react-native$/,
                replacement: path.resolve(__dirname, 'tests/lucide-react-native-stub.cjs'),
            },
        ],
    },
    test: {
        environment: 'node',
        include: [
            'tests/**/*.test.ts',
            'tests/**/*.test.tsx',
            // app shell's bundled core
            'packages/@tinycld/core/**/__tests__/**/*.test.ts',
            'packages/@tinycld/core/**/__tests__/**/*.test.tsx',
            'packages/@tinycld/core/**/*.test.ts',
            'packages/@tinycld/core/**/*.test.tsx',
            // feature members (siblings) — one level up from the app shell
            '../contacts/tests/**/*.test.{ts,tsx}',
            '../mail/tests/**/*.test.{ts,tsx}',
            '../calendar/tests/**/*.test.{ts,tsx}',
            '../drive/tests/**/*.test.{ts,tsx}',
            '../calc/tests/**/*.test.{ts,tsx}',
            '../text/tests/**/*.test.{ts,tsx}',
            '../google-takeout-import/tests/**/*.test.{ts,tsx}',
        ],
        exclude: [
            '../google-takeout-import/tests/worker-bridge.test.ts',
            'packages/@tinycld/core/ideas/**',
            'node_modules/**',
        ],
        setupFiles: ['tests/unit-setup.ts'],
    },
})
