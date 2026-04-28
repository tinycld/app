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
        ],
    },
    test: {
        environment: 'node',
        include: [
            'tests/**/*.test.ts',
            'packages/*/tests/**/*.test.ts',
            'packages/@*/*/tests/**/*.test.ts',
            'packages/@tinycld/core/**/__tests__/**/*.test.ts',
            'packages/@tinycld/core/**/*.test.ts',
        ],
        exclude: [
            'packages/@tinycld/google-takeout-import/tests/worker-bridge.test.ts',
            'packages/@tinycld/core/ideas/**',
            'node_modules/**',
        ],
        setupFiles: ['tests/unit-setup.ts'],
    },
})
