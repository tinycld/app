import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        alias: [
            {
                find: /^@tinycld\/core\/global\.css$/,
                replacement: path.resolve(__dirname, 'packages/@tinycld/core/global.css'),
            },
            {
                find: /^@tinycld\/core\/Providers$/,
                replacement: path.resolve(
                    __dirname,
                    'packages/@tinycld/core/tinycld/core/components/Providers.tsx'
                ),
            },
            {
                find: /^@tinycld\/core$/,
                replacement: path.resolve(__dirname, 'packages/@tinycld/core/index.ts'),
            },
            {
                find: /^@tinycld\/core\/(.+)$/,
                replacement: path.resolve(__dirname, 'packages/@tinycld/core/tinycld/core/$1'),
            },
            {
                find: /^@tinycld\/app-generated\/(.+)$/,
                replacement: path.resolve(__dirname, 'lib/generated/$1'),
            },
            // Core uses `~/tinycld/core/*` for its own internal imports.
            // When core's source files are reached via the @tinycld/core
            // sibling symlink, those imports must still resolve to core's
            // tree, not tinycld's.
            {
                find: /^~\/tinycld\/core\/(.+)$/,
                replacement: path.resolve(__dirname, 'packages/@tinycld/core/tinycld/core/$1'),
            },
            { find: /^~\/(.+)$/, replacement: path.resolve(__dirname, '$1') },
        ],
    },
    test: {
        environment: 'node',
        include: [
            'tests/**/*.test.ts',
            'packages/*/tests/**/*.test.ts',
            'packages/@*/*/tests/**/*.test.ts',
        ],
        // Core's own unit tests run in core itself (bun run test:unit there),
        // not through tinycld. They use core-private aliases that don't apply
        // here. The takeout package's worker-bridge test transitively imports
        // core's takeout-import-store.ts, which pulls in @react-native-async-
        // storage/async-storage; the package's internal RN-module-bridge
        // imports bypass our `vi.mock(...)` shim because they resolve via
        // the real node_modules realpath. The test passes in core's own
        // vitest where async-storage is also mocked at the realpath level.
        exclude: [
            'packages/@tinycld/core/**',
            'packages/@tinycld/google-takeout-import/tests/worker-bridge.test.ts',
            'node_modules/**',
        ],
        setupFiles: ['tests/unit-setup.ts'],
    },
})
