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

import { type ChildProcess, spawn } from 'node:child_process'
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

async function pickBlock(): Promise<PortBlock> {
    for (let i = 0; i < MAX_BLOCK_ATTEMPTS; i++) {
        const base = DEFAULT_PROXY_PORT + i * BLOCK_SHIFT
        const candidate: PortBlock = { proxy: base, pb: base + 1, expo: base + 2 }
        const results = await Promise.all([
            probePort(candidate.proxy),
            probePort(candidate.pb),
            probePort(candidate.expo),
        ])
        if (results.every(Boolean)) return candidate
    }
    throw new Error(
        `dev: no free port block in range ${DEFAULT_PROXY_PORT}..${DEFAULT_PROXY_PORT + MAX_BLOCK_ATTEMPTS * BLOCK_SHIFT}`
    )
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
