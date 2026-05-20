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

// Feature packages are npm workspace members, symlinked into
// node_modules/@tinycld/<name>. Playwright's glob walker does not follow
// symlinks and testMatch entries must live under testDir — so give each member
// its own project with testDir pointing at the member's tests/ THROUGH the
// node_modules symlink. Routing via node_modules (not the sibling's real path)
// keeps node's module resolution walking up through
// tinycld/node_modules/@tinycld/<name>/tests → tinycld/node_modules, so
// `@playwright/test` and other deps resolve against the app shell's install.
function siblingProjects() {
    const roots: { name: string; testDir: string }[] = []
    const scopeDir = path.join(CORE_ROOT, 'node_modules', '@tinycld')
    if (!fs.existsSync(scopeDir)) return roots

    for (const entry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        // Skip bundled core (no e2e specs of its own here) and anything that
        // isn't a real package dir reachable through the symlink.
        if (entry.name === 'core') continue
        const linkPath = path.join(scopeDir, entry.name)
        const found = siblingTestDir(linkPath)
        if (found) roots.push({ name: `@tinycld/${entry.name}`, testDir: found })
    }
    return roots
}

// Resolve to the member's tests/ directory through the node_modules symlink.
// Returning the symlinked path (NOT realpath) keeps node's module resolution
// walking up through tinycld/node_modules, so peer deps resolve against the
// app shell's install.
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
        command: 'npm run expo:test',
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
