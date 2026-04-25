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
        // here. Similarly, google-takeout-import's worker-bridge test transit-
        // ively imports @tinycld/core/lib/config which pulls in react-native —
        // needs a resolution story that works without preserveSymlinks tricks;
        // tracked as follow-up.
        exclude: [
            'packages/@tinycld/core/**',
            'packages/@tinycld/google-takeout-import/tests/worker-bridge.test.ts',
            'node_modules/**',
        ],
        setupFiles: ['tests/unit-setup.ts'],
    },
})
