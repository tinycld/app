import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        alias: {
            '@tinycld/core': path.resolve(__dirname, 'packages/@tinycld/core'),
            '@tinycld/app-generated': path.resolve(__dirname, 'lib/generated'),
            '~': path.resolve(__dirname, '.'),
        },
    },
    test: {
        environment: 'node',
        include: [
            'tests/**/*.test.ts',
            'packages/*/tests/**/*.test.ts',
            'packages/@*/*/tests/**/*.test.ts',
        ],
    },
})
