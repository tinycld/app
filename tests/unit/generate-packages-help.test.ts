import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const GEN_SCRIPT = path.resolve(__dirname, '../../scripts/generate-packages.ts')

function setupAppRoot(root: string): void {
    fs.mkdirSync(path.join(root, 'packages'), { recursive: true })
    fs.mkdirSync(path.join(root, 'server'), { recursive: true })
    fs.mkdirSync(path.join(root, 'server/pb_migrations'), { recursive: true })
    fs.mkdirSync(path.join(root, 'lib/generated'), { recursive: true })
    fs.mkdirSync(path.join(root, 'app/a/[orgSlug]'), { recursive: true })
    fs.writeFileSync(
        path.join(root, 'server/go.mod'),
        'module tinycld.org/app\n\ngo 1.25.0\n\nrequire github.com/pocketbase/pocketbase v0.36.8\n'
    )
}

function runGenerator(tmp: string, extraEnv: Record<string, string> = {}) {
    execFileSync('npx', ['tsx', GEN_SCRIPT], {
        env: {
            ...process.env,
            TINYCLD_APP_ROOT: tmp,
            TINYCLD_GENERATED_DIR: path.join(tmp, 'lib/generated'),
            TINYCLD_APP_DIR: path.join(tmp, 'app'),
            TINYCLD_SERVER_DIR: path.join(tmp, 'server'),
            TINYCLD_CORE_MIGRATIONS_DIR: path.join(tmp, '__no-core-migrations__'),
            ...extraEnv,
        },
        stdio: 'pipe',
    })
}

function writeTopic(
    dir: string,
    fileBase: string,
    frontmatter: Record<string, string | number>,
    body: string
) {
    fs.mkdirSync(dir, { recursive: true })
    const fmLines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`)
    const content = `---\n${fmLines.join('\n')}\n---\n\n${body}`
    fs.writeFileSync(path.join(dir, `${fileBase}.md`), content)
}

describe('generate-packages: help registry', () => {
    let tmp: string

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-pkgs-help-'))
        setupAppRoot(tmp)
    })

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true })
    })

    it('emits an empty registry when no help content is provided', () => {
        runGenerator(tmp, { TINYCLD_CORE_HELP_DIR: path.join(tmp, '__no-help__') })
        const out = fs.readFileSync(path.join(tmp, 'lib/generated/package-help.ts'), 'utf8')
        expect(out).toContain('export const packageHelp: HelpGroup[] = [')
        expect(out).toContain('export interface HelpTopicEntry')
        expect(out).toContain('export interface HelpGroup')
        expect(out).toMatch(/packageHelp: HelpGroup\[\] = \[\s*\]/)
    })

    it('discovers topics from frontmatter .md files', () => {
        const helpDir = path.join(tmp, 'core-help')
        writeTopic(
            helpDir,
            'alpha',
            { title: 'Alpha', summary: 'First topic', tags: '[t1, "tag two"]' },
            '## Alpha body\n'
        )

        runGenerator(tmp, { TINYCLD_CORE_HELP_DIR: helpDir })

        const out = fs.readFileSync(path.join(tmp, 'lib/generated/package-help.ts'), 'utf8')
        expect(out).toContain('"@tinycld/core"')
        expect(out).toContain('"core:alpha"')
        expect(out).toContain('"Alpha"')
        expect(out).toContain('"First topic"')
        expect(out).toContain('"tag two"')
        expect(out).toContain('Alpha body')
    })

    it('sorts topics by frontmatter order then by filename', () => {
        const helpDir = path.join(tmp, 'core-help')
        writeTopic(helpDir, 'zulu', { title: 'Zulu', summary: 's', order: 10 }, 'body')
        writeTopic(helpDir, 'alpha', { title: 'Alpha', summary: 's', order: 20 }, 'body')
        writeTopic(helpDir, 'beta', { title: 'Beta', summary: 's', order: 20 }, 'body')

        runGenerator(tmp, { TINYCLD_CORE_HELP_DIR: helpDir })

        const out = fs.readFileSync(path.join(tmp, 'lib/generated/package-help.ts'), 'utf8')
        const zuluIdx = out.indexOf('"core:zulu"')
        const alphaIdx = out.indexOf('"core:alpha"')
        const betaIdx = out.indexOf('"core:beta"')
        expect(zuluIdx).toBeLessThan(alphaIdx) // order 10 before order 20
        expect(alphaIdx).toBeLessThan(betaIdx) // same order, alphabetical
    })

    it('throws when a topic is missing required frontmatter', () => {
        const helpDir = path.join(tmp, 'core-help')
        writeTopic(helpDir, 'no-title', { summary: 'has summary, missing title' }, 'body')
        expect(() => runGenerator(tmp, { TINYCLD_CORE_HELP_DIR: helpDir })).toThrow()
    })

    it('throws when a topic has no frontmatter block', () => {
        const helpDir = path.join(tmp, 'core-help')
        fs.mkdirSync(helpDir, { recursive: true })
        fs.writeFileSync(path.join(helpDir, 'bare.md'), '## Just a body, no frontmatter\n')
        expect(() => runGenerator(tmp, { TINYCLD_CORE_HELP_DIR: helpDir })).toThrow()
    })
})
