// Dev launcher: spawns the Go PB server + Expo, and runs an HTTP proxy on
// the user-facing port that routes /api and /_ to PB and everything else to
// Expo.
//
// SSL: enabled by default if assets/localhost*.pem are present, disabled
// if absent. Override with --ssl (force on, errors if certs missing) or
// --no-ssl (force off). The proxy listens with TLS when enabled.
//
// Defaults: proxy 7100, PB 7101, Expo 7102. If any port in the block is
// taken we shift the whole block by +10 and re-probe so they stay grouped.
//
// On web, the app always resolves PB at window.location.origin, so the
// dev proxy at the user-facing port handles /api and /_ same-origin. No
// EXPO_PUBLIC_ENV plumbing or build-time URL injection — everything works
// off the page's own origin.

import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as https from 'node:https'
import * as net from 'node:net'
import * as path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const CERT_PATH = path.join(ROOT, 'assets', 'localhost.pem')
const KEY_PATH = path.join(ROOT, 'assets', 'localhost-key.pem')

const DEFAULT_PROXY_PORT = 7100
const BLOCK_SHIFT = 10
const MAX_BLOCK_ATTEMPTS = 5

// SSL is on when both cert files exist, unless explicitly disabled with
// --no-ssl. --ssl forces it on (and fails if certs are missing).
function resolveUseSsl(): boolean {
    if (process.argv.includes('--no-ssl')) return false
    if (process.argv.includes('--ssl')) {
        if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
            throw new Error(`--ssl requires ${CERT_PATH} and ${KEY_PATH}; generate with mkcert`)
        }
        return true
    }
    return fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)
}

const useSsl = resolveUseSsl()

interface PortBlock {
    proxy: number
    pb: number
    expo: number
}

async function probePort(port: number): Promise<boolean> {
    return new Promise(resolve => {
        const server = net.createServer()
        server.once('error', () => resolve(false))
        server.once('listening', () => {
            server.close(() => resolve(true))
        })
        server.listen(port, '127.0.0.1')
    })
}

async function tryConnect(port: number, host = '127.0.0.1'): Promise<boolean> {
    return new Promise(resolve => {
        const sock = net.connect({ port, host })
        const done = (ok: boolean) => {
            sock.removeAllListeners()
            sock.destroy()
            resolve(ok)
        }
        sock.once('connect', () => done(true))
        sock.once('error', () => done(false))
    })
}

async function waitForUpstream(port: number, label: string, timeoutMs = 60_000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        if (await tryConnect(port)) return
        await new Promise(r => setTimeout(r, 200))
    }
    throw new Error(`dev: ${label} on :${port} did not accept connections within ${timeoutMs}ms`)
}

async function isBlockFree(block: PortBlock): Promise<boolean> {
    const results = await Promise.all([
        probePort(block.proxy),
        probePort(block.pb),
        probePort(block.expo),
    ])
    return results.every(Boolean)
}

function blockAt(i: number): PortBlock {
    const base = DEFAULT_PROXY_PORT + i * BLOCK_SHIFT
    return { proxy: base, pb: base + 1, expo: base + 2 }
}

interface PortHolder {
    pid: number
    command: string
}

function findPortHolder(port: number): PortHolder | null {
    // lsof on macOS: -t prints just PIDs, -nP skips DNS/port-name lookups,
    // -sTCP:LISTEN restricts to the listening socket so we don't catch
    // ephemeral clients.
    const lsof = spawnSync('lsof', ['-t', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
        encoding: 'utf8',
    })
    const pid = Number.parseInt(lsof.stdout.trim().split('\n')[0] ?? '', 10)
    if (!Number.isFinite(pid) || pid <= 0) return null
    const ps = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' })
    return { pid, command: ps.stdout.trim() || '<unknown>' }
}

function prompt(question: string): Promise<string> {
    process.stdout.write(question)
    return new Promise(resolve => {
        const onData = (chunk: Buffer) => {
            process.stdin.removeListener('data', onData)
            process.stdin.pause()
            resolve(chunk.toString('utf8').trim())
        }
        process.stdin.resume()
        process.stdin.once('data', onData)
    })
}

async function waitForPortFree(port: number, timeoutMs = 5_000): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        if (await probePort(port)) return true
        await new Promise(r => setTimeout(r, 100))
    }
    return false
}

async function findFreeBlock(startIndex: number): Promise<PortBlock | null> {
    for (let i = startIndex; i < MAX_BLOCK_ATTEMPTS; i++) {
        const candidate = blockAt(i)
        if (await isBlockFree(candidate)) return candidate
    }
    return null
}

async function pickBlock(): Promise<PortBlock> {
    const preferred = blockAt(0)
    if (await isBlockFree(preferred)) return preferred

    // Default block taken — show the user who's holding it and what to do.
    const holder = findPortHolder(preferred.proxy)
    process.stdout.write(`\ndev: port ${preferred.proxy} is in use`)
    if (holder) {
        process.stdout.write(` by pid ${holder.pid} (${holder.command})`)
    }
    process.stdout.write('\n')

    const interactive = process.stdin.isTTY === true
    if (!interactive) {
        const fallback = await findFreeBlock(1)
        if (!fallback) {
            throw new Error(
                `dev: no free port block in range ${DEFAULT_PROXY_PORT}..${DEFAULT_PROXY_PORT + MAX_BLOCK_ATTEMPTS * BLOCK_SHIFT}`
            )
        }
        process.stdout.write(`dev: non-interactive shell, falling back to :${fallback.proxy}\n`)
        return fallback
    }

    const fallback = await findFreeBlock(1)
    const fallbackHint = fallback ? `:${fallback.proxy}` : 'none free'
    const canKill = holder !== null
    const choices = canKill ? '[k]ill, [u]se alternative, [q]uit' : '[u]se alternative, [q]uit'
    const answer = (
        await prompt(`Choose: ${choices} (alternative=${fallbackHint}): `)
    ).toLowerCase()

    if (answer === 'q' || answer === 'quit') {
        throw new Error('dev: aborted by user')
    }
    if (answer === 'k' || answer === 'kill') {
        if (!canKill) throw new Error('dev: no holder to kill (lsof returned nothing)')
        process.stdout.write(`dev: killing pid ${holder.pid}\n`)
        try {
            process.kill(holder.pid, 'SIGTERM')
        } catch (err) {
            throw new Error(
                `dev: failed to signal pid ${holder.pid}: ${err instanceof Error ? err.message : String(err)}`
            )
        }
        if (!(await waitForPortFree(preferred.proxy))) {
            // Escalate to SIGKILL if SIGTERM didn't free the port in time.
            process.stdout.write(
                `dev: pid ${holder.pid} still holding :${preferred.proxy}, sending SIGKILL\n`
            )
            try {
                process.kill(holder.pid, 'SIGKILL')
            } catch {
                // process may already be gone
            }
            if (!(await waitForPortFree(preferred.proxy))) {
                throw new Error(`dev: port ${preferred.proxy} still in use after SIGKILL`)
            }
        }
        if (await isBlockFree(preferred)) return preferred
        // Killing the proxy holder freed :proxy but :pb or :expo is still
        // taken — fall through to alternative.
        process.stdout.write(
            `dev: port ${preferred.proxy} freed, but the rest of the block isn't — using alternative\n`
        )
    }
    // Default branch (including 'u'/'use'/empty input): alternative block.
    if (!fallback) {
        throw new Error(
            `dev: no free port block in range ${DEFAULT_PROXY_PORT}..${DEFAULT_PROXY_PORT + MAX_BLOCK_ATTEMPTS * BLOCK_SHIFT}`
        )
    }
    return fallback
}

function withPrefix(prefix: string, color: string) {
    return (chunk: Buffer | string) => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
        for (const line of text.split('\n')) {
            if (line.length === 0) continue
            process.stdout.write(`${color}[${prefix}]\x1b[0m ${line}\n`)
        }
    }
}

function buildPbSync() {
    const buildResult = spawn('go', ['build', '-o', 'tinycld', '.'], {
        cwd: path.join(ROOT, 'server'),
        stdio: 'inherit',
    })
    return new Promise<void>((resolve, reject) => {
        buildResult.on('exit', code => {
            if (code === 0) resolve()
            else reject(new Error(`go build exited with code ${code}`))
        })
        buildResult.on('error', reject)
    })
}

function spawnPbBinary(pbPort: number, publicUrl: string): ChildProcess {
    const onPbOut = withPrefix('pb', '\x1b[36m') // cyan
    const onPbErr = withPrefix('pb', '\x1b[31m') // red
    const child = spawn(
        path.join(ROOT, 'server', 'tinycld'),
        [
            '--dev',
            '--http',
            `127.0.0.1:${pbPort}`,
            '--typesDir',
            path.join(ROOT, 'packages', '@tinycld/core', 'types'),
            'serve',
        ],
        {
            cwd: ROOT,
            stdio: ['inherit', 'pipe', 'pipe'],
            // PB's first-run installer prints a /setup URL using the address
            // it bound to. Override with the public proxy URL so the printed
            // URL points where the user actually browses, not at PB's
            // internal port.
            env: { ...process.env, TINYCLD_PUBLIC_URL: publicUrl },
        }
    )
    child.stdout?.on('data', onPbOut)
    child.stderr?.on('data', onPbErr)
    return child
}

function spawnExpo(expoPort: number, onReady: () => void): ChildProcess {
    const onOut = withPrefix('expo', '\x1b[35m') // magenta
    const onErr = withPrefix('expo', '\x1b[31m')
    const child = spawn('bunx', ['expo', 'start', '--clear', '--port', String(expoPort)], {
        cwd: ROOT,
        stdio: ['inherit', 'pipe', 'pipe'],
    })
    // Expo prints "Logs for your project will appear …" once the dev server
    // is fully up. We use that as the signal to print the banner so it lands
    // at the bottom of the noisy startup output instead of being buried.
    let readyFired = false
    const watchForReady = (chunk: Buffer | string) => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
        if (!readyFired && text.includes('Logs for your project will appear')) {
            readyFired = true
            onReady()
        }
    }
    child.stdout?.on('data', chunk => {
        watchForReady(chunk)
        onOut(chunk)
    })
    child.stderr?.on('data', onErr)
    return child
}

function isPbPath(url: string): boolean {
    // PB owns /api/* (REST + SSE realtime + custom routes) and /_/* (admin UI).
    return url.startsWith('/api') || url.startsWith('/_/') || url === '/_'
}

function startProxy(opts: { proxyPort: number; pbPort: number; expoPort: number; ssl: boolean }) {
    const log = withPrefix('proxy', '\x1b[33m') // yellow

    const handler: http.RequestListener = (req, res) => {
        const target = isPbPath(req.url ?? '/') ? opts.pbPort : opts.expoPort
        const upstream = http.request(
            {
                host: '127.0.0.1',
                port: target,
                method: req.method,
                path: req.url,
                headers: { ...req.headers, host: `127.0.0.1:${target}` },
            },
            upstreamRes => {
                res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
                upstreamRes.pipe(res)
            }
        )
        upstream.on('error', err => {
            log(`upstream :${target} error: ${err.message}\n`)
            if (!res.headersSent) res.writeHead(502)
            res.end('Bad Gateway')
        })
        req.pipe(upstream)
    }

    // WebSocket upgrades — Expo dev server uses WS for HMR. PB doesn't use WS
    // (its realtime is SSE, plain HTTP), but route by path anyway.
    const onUpgrade = (req: http.IncomingMessage, clientSocket: NodeJS.Socket, head: Buffer) => {
        const target = isPbPath(req.url ?? '/') ? opts.pbPort : opts.expoPort
        const upstreamSocket = net.connect(target, '127.0.0.1', () => {
            const headerLines = [
                `${req.method} ${req.url} HTTP/${req.httpVersion}`,
                ...Object.entries(req.headers).map(
                    ([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`
                ),
                '',
                '',
            ]
            upstreamSocket.write(headerLines.join('\r\n'))
            if (head.length > 0) upstreamSocket.write(head)
            upstreamSocket.pipe(clientSocket as unknown as NodeJS.WritableStream)
            ;(clientSocket as unknown as NodeJS.ReadableStream).pipe(upstreamSocket)
        })
        upstreamSocket.on('error', err => {
            log(`upgrade upstream :${target} error: ${err.message}\n`)
            ;(clientSocket as unknown as { destroy: () => void }).destroy()
        })
    }

    let server: http.Server | https.Server
    if (opts.ssl) {
        server = https.createServer(
            { cert: fs.readFileSync(CERT_PATH), key: fs.readFileSync(KEY_PATH) },
            handler
        )
    } else {
        server = http.createServer(handler)
    }
    server.on('upgrade', onUpgrade)
    server.listen(opts.proxyPort, '127.0.0.1')
    return server
}

function printBanner(block: PortBlock, ssl: boolean, suffix?: string) {
    const scheme = ssl ? 'https' : 'http'
    const lines = [
        '',
        `\x1b[1m  TinyCld dev\x1b[0m`,
        `  Open: \x1b[32m${scheme}://localhost:${block.proxy}\x1b[0m`,
        `  PB:    127.0.0.1:${block.pb} (proxied at /api, /_)`,
        `  Expo:  127.0.0.1:${block.expo}`,
    ]
    if (suffix) lines.push(`  \x1b[33m${suffix}\x1b[0m`)
    lines.push('')
    process.stdout.write(`${lines.join('\n')}\n`)
}

async function main() {
    const block = await pickBlock()

    // Run packages:generate before launching, mirroring the old `predev`
    // hook. Failing this should fail-fast so the user sees the error.
    const gen = spawn('bunx', ['tsx', 'scripts/generate-packages.ts'], {
        cwd: ROOT,
        stdio: 'inherit',
    })
    await new Promise<void>((resolve, reject) => {
        gen.on('exit', code =>
            code === 0 ? resolve() : reject(new Error(`packages:generate exited ${code}`))
        )
        gen.on('error', reject)
    })

    await buildPbSync()

    // Defer the banner until Expo signals ready (or a 60s fallback fires)
    // so it doesn't get buried under bundling/migration logs.
    let bannerPrinted = false
    const printOnce = (suffix?: string) => {
        if (bannerPrinted) return
        bannerPrinted = true
        printBanner(block, useSsl, suffix)
    }

    const publicUrl = `${useSsl ? 'https' : 'http'}://localhost:${block.proxy}`
    const pb = spawnPbBinary(block.pb, publicUrl)
    const expo = spawnExpo(block.expo, () => printOnce())

    // Wait for both upstreams to accept TCP connections before binding the
    // user-facing proxy. Otherwise the browser hits the proxy first, the
    // proxy forwards to a port that's not listening yet, and the user sees
    // 502s + ECONNREFUSED noise during cold start. A few seconds of
    // "connection refused" on :proxy is fine — browsers retry, and the
    // banner only prints once Expo signals ready anyway.
    await Promise.all([waitForUpstream(block.pb, 'pb'), waitForUpstream(block.expo, 'expo')])

    const server = startProxy({
        proxyPort: block.proxy,
        pbPort: block.pb,
        expoPort: block.expo,
        ssl: useSsl,
    })

    const fallbackTimer = setTimeout(() => {
        printOnce('(still bundling — open the URL once Expo is ready)')
    }, 60_000)
    fallbackTimer.unref()

    let shuttingDown = false
    const shutdown = (signal: NodeJS.Signals) => {
        if (shuttingDown) return
        shuttingDown = true
        process.stdout.write(`\nshutting down (${signal})\n`)
        server.close()
        pb.kill('SIGTERM')
        expo.kill('SIGTERM')
        // give children a moment, then exit
        setTimeout(() => {
            process.exit(0)
        }, 500).unref()
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // If either child dies on its own, tear down the others.
    pb.on('exit', code => {
        process.stdout.write(`pb exited (${code}); shutting down\n`)
        shutdown('SIGTERM')
    })
    expo.on('exit', code => {
        process.stdout.write(`expo exited (${code}); shutting down\n`)
        shutdown('SIGTERM')
    })
}

void main().catch(err => {
    process.stderr.write(`dev: ${err instanceof Error ? err.stack : String(err)}\n`)
    process.exit(1)
})
