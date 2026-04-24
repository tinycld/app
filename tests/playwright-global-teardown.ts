/**
 * Playwright Global Teardown
 *
 * Stops the PocketBase test server started by global setup.
 * Uses a PID file for reliable cleanup even after crashes.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..')
const PID_FILE = path.join(PROJECT_ROOT, 'server/.test-pb.pid')

export default async function globalTeardown() {
    try {
        const pid = fs.readFileSync(PID_FILE, 'utf-8').trim()
        process.kill(Number(pid), 'SIGTERM')
        fs.unlinkSync(PID_FILE)
        console.log('[test-teardown] Stopped PocketBase test server.')
    } catch {
        // PID file missing or process already dead — nothing to do
    }
}
