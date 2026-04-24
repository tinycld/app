/**
 * Playwright Global Setup
 *
 * Resets and seeds a dedicated test database, then keeps PocketBase
 * running on port 7091 for the duration of the test run.
 * Uses server/pb_test_data so tests never interfere with dev.
 */

import { spawn, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..')
const PB_BINARY = path.join(PROJECT_ROOT, 'server/tinycld')
const PB_DATA_DIR = path.join(PROJECT_ROOT, 'server/pb_test_data')
const MIGRATIONS_PATH = 'server/pb_migrations'
const PB_MIGRATIONS_DIR = path.join(PROJECT_ROOT, MIGRATIONS_PATH)
const PB_PORT = 7091
const PID_FILE = path.join(PROJECT_ROOT, 'server/.test-pb.pid')
export const TMP_DIR = path.join(PROJECT_ROOT, 'tmp')
export const EMAIL_LOG_PATH = path.join(TMP_DIR, 'emails.log')

async function waitForPocketBase(maxAttempts = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await fetch(`http://127.0.0.1:${PB_PORT}/api/health`)
            if (response.ok) return true
        } catch {
            // not ready yet
        }
        await new Promise(r => setTimeout(r, 1000))
    }
    return false
}

function resetDatabase(): boolean {
    const result = spawnSync(
        'npx',
        [
            'tsx',
            'scripts/reset-dev-db.ts',
            '--url',
            `http://127.0.0.1:${PB_PORT}`,
            '--data-dir',
            'server/pb_test_data',
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
    console.log('\n[test-setup] Resetting test database...')

    if (!resetDatabase()) {
        throw new Error('[test-setup] Database reset failed')
    }

    // Ensure tmp/ exists and reset the email log so tests see a clean slate.
    fs.mkdirSync(TMP_DIR, { recursive: true })
    fs.writeFileSync(EMAIL_LOG_PATH, '')

    console.log('[test-setup] Starting PocketBase on port', PB_PORT)
    const pb = spawn(
        PB_BINARY,
        [
            '--dev',
            '--dir',
            PB_DATA_DIR,
            '--migrationsDir',
            PB_MIGRATIONS_DIR,
            '--http',
            `127.0.0.1:${PB_PORT}`,
            'serve',
        ],
        {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: true,
            env: {
                ...process.env,
                IMAP_ADDR: ':1193',
                IMAPS_ADDR: ':11993',
                SMTP_ADDR: ':1587',
                SKIP_SENDING_MAIL: 'true',
                TINYCLD_EMAIL_LOG: EMAIL_LOG_PATH,
            },
        }
    )

    let pbOutput = ''
    pb.stdout?.on('data', d => {
        pbOutput += d.toString()
    })
    pb.stderr?.on('data', d => {
        const msg = d.toString()
        pbOutput += msg
        process.stderr.write(`[pocketbase] ${msg}`)
    })

    pb.unref()

    const ready = await waitForPocketBase()
    if (!ready) {
        console.error('[test-setup] PocketBase failed to start. Output:\n', pbOutput)
        pb.kill()
        throw new Error('[test-setup] PocketBase failed to start')
    }

    // Write PID file so teardown can reliably stop it
    fs.writeFileSync(PID_FILE, String(pb.pid))

    console.log('[test-setup] Test database ready, PocketBase running.\n')
}

//globalSetup()
