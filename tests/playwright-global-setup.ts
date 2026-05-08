/**
 * Playwright Global Setup
 *
 * Resets and seeds the dedicated test database at server/pb_test_data so
 * tests run against a known fixture and never collide with the dev DB.
 * The seeded DB is then served by `bun run expo:test` (which is just
 * `scripts/dev.ts --port 7200 --pb-data-dir server/pb_test_data`),
 * launched as Playwright's webServer.
 *
 * scripts/reset-dev-db.ts owns the lifecycle of its own short-lived PB:
 * it boots PB on --url, runs the seed, then SIGTERMs it before exiting.
 * That cleanly releases the SQLite lock so dev.ts can take over the
 * data directory.
 */

import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..')
const PB_TEST_DATA_DIR = 'server/pb_test_data'
// Picked to not collide with the dev block (7100..) or the test block
// (7200..). Only used while reset-dev-db.ts is running its own PB to
// apply migrations + seed; nothing else listens here.
const SEED_PB_PORT = 7299
export const TMP_DIR = path.join(PROJECT_ROOT, 'tmp')
export const EMAIL_LOG_PATH = path.join(TMP_DIR, 'emails.log')

function resetAndSeed(): boolean {
    const result = spawnSync(
        'npx',
        [
            'tsx',
            'scripts/reset-dev-db.ts',
            '--url',
            `http://127.0.0.1:${SEED_PB_PORT}`,
            '--data-dir',
            PB_TEST_DATA_DIR,
        ],
        {
            cwd: PROJECT_ROOT,
            stdio: 'inherit',
            env: process.env,
            timeout: 90_000,
        }
    )

    return result.status === 0
}

export default async function globalSetup() {
    console.log('\n[test-setup] Resetting + seeding test database...')

    if (!resetAndSeed()) {
        throw new Error('[test-setup] Database reset/seed failed')
    }

    // Ensure tmp/ exists and reset the email log so tests see a clean slate.
    // The Go server reads $TINYCLD_EMAIL_LOG; dev.ts inherits it from the
    // env that Playwright spawned bun-run-expo:test with, which is the
    // same env Playwright runs the spec processes in.
    fs.mkdirSync(TMP_DIR, { recursive: true })
    fs.writeFileSync(EMAIL_LOG_PATH, '')

    console.log('[test-setup] Test database seeded.\n')
}
