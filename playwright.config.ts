import * as fs from 'node:fs'
import * as path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

try {
    process.loadEnvFile()
} catch {
    // .env may not exist in CI
}

const TEST_EXPO_PORT = 7200
const CORE_ROOT = import.meta.dirname

// Sibling packages are symlinks under packages/. Playwright's glob walker
// does not follow symlinks, and testMatch entries must live under testDir —
// so give each linked package its own project with testDir = the sibling's
// realpath. That lets us list and run tests from every linked package in
// one go without copying or mirroring them into core.
function siblingProjects() {
    const roots: { name: string; testDir: string }[] = []
    const packagesRoot = path.join(CORE_ROOT, 'packages')
    if (!fs.existsSync(packagesRoot)) return roots

    for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
        if (entry.name.startsWith('@') && entry.isDirectory()) {
            const scopeDir = path.join(packagesRoot, entry.name)
            for (const scoped of fs.readdirSync(scopeDir, { withFileTypes: true })) {
                const found = siblingTestDir(path.join(scopeDir, scoped.name))
                if (found) roots.push({ name: `${entry.name}/${scoped.name}`, testDir: found })
            }
        } else if (entry.isSymbolicLink() || entry.isDirectory()) {
            const found = siblingTestDir(path.join(packagesRoot, entry.name))
            if (found) roots.push({ name: entry.name, testDir: found })
        }
    }
    return roots
}

// Resolve the symlink-based path (NOT realpath) to the sibling's tests/
// directory. Returning the symlinked path keeps node's module resolution
// walking up through core/packages/.../tests → core/node_modules, so
// `@playwright/test` and other peer deps resolve against core's install.
function siblingTestDir(linkPath: string): string | null {
    try {
        const real = fs.realpathSync(linkPath)
        if (!fs.existsSync(path.join(real, 'tests'))) return null
        return path.join(linkPath, 'tests')
    } catch {
        return null
    }
}

const chromium = { ...devices['Desktop Chrome'] }

export default defineConfig({
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    globalSetup: './tests/playwright-global-setup.ts',
    use: {
        baseURL: `http://localhost:${TEST_EXPO_PORT}`,
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'core',
            testDir: path.join(CORE_ROOT, 'tests/e2e'),
            testMatch: '**/*.spec.ts',
            use: chromium,
        },
        ...siblingProjects().map(({ name, testDir }) => ({
            name,
            testDir,
            testMatch: '**/*.spec.ts',
            use: chromium,
        })),
    ],
    webServer: {
        command: 'bun run expo:test',
        url: `http://localhost:${TEST_EXPO_PORT}`,
        // Always start a fresh dev.ts. expo:test chains
        // `reset-dev-db.ts && dev.ts`, so the data dir is wiped and reseeded
        // every run. If Playwright reused a previous dev.ts instance, its
        // PB would still hold cached auth/collection state pointing at the
        // old user/org IDs — every API call would return stale or empty
        // data and tests would see "0 contacts" while the DB on disk is
        // freshly populated.
        reuseExistingServer: false,
        // dev.ts spawns PB + Expo + a proxy. PB starts fast but Expo's cold
        // --clear bundle can take 2-3 minutes; dev.ts itself waits up to
        // 180s, so the webServer timeout has to be at least that plus buffer.
        timeout: 240_000,
        // Test-mode env passthrough for the PB child that dev.ts spawns.
        // SKIP_SENDING_MAIL keeps tests offline; TINYCLD_EMAIL_LOG lets
        // email-log-helpers assert what would have gone out; the IMAP/SMTP
        // address overrides keep PB's mail listeners off the dev ports.
        env: {
            SKIP_SENDING_MAIL: 'true',
            TINYCLD_EMAIL_LOG: path.join(CORE_ROOT, 'tmp/emails.log'),
            IMAP_ADDR: ':1193',
            IMAPS_ADDR: ':11993',
            SMTP_ADDR: ':1587',
        },
    },
})
