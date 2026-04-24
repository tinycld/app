#!/usr/bin/env bunx tsx
/**
 * Database Seed Script
 *
 * Populates the PocketBase database with a test user and org.
 *
 * Usage:
 *   bunx tsx scripts/seed-db.ts [options]
 *
 * Options:
 *   --url <url>           PocketBase URL (default: http://127.0.0.1:7090)
 *   --admin-email <email> Admin email
 *   --admin-pw <pw>       Admin password
 *   --help                Show this help message
 */

import PocketBase from 'pocketbase'
import { packageSeeds } from '../lib/generated/package-seeds'

function log(...args: unknown[]) {
    process.stdout.write(`[seed] ${args.join(' ')}\n`)
}

function logError(...args: unknown[]) {
    process.stderr.write(`[seed] ${args.join(' ')}\n`)
}

try {
    process.loadEnvFile()
} catch {
    // .env may not exist in CI
}

interface SeedConfig {
    url: string
    adminEmail: string
    adminPassword: string
}

function parseArgs(): SeedConfig {
    const args = process.argv.slice(2)
    const config: SeedConfig = {
        url: 'http://127.0.0.1:7090',
        adminEmail: process.env.ADMIN_USER_LOGIN || 'admin@tinycld.org',
        adminPassword: process.env.ADMIN_USER_PW || 'AdminPass1234!',
    }

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        switch (arg) {
            case '--url':
                config.url = args[++i]
                break
            case '--admin-email':
                config.adminEmail = args[++i]
                break
            case '--admin-pw':
                config.adminPassword = args[++i]
                break
            case '--help':
                process.exit(0)
                break
            default:
                if (arg.startsWith('-')) {
                    process.exit(1)
                }
        }
    }

    return config
}

const TEST_ORG_NAME = 'Test Organization'
const TEST_ORG_SLUG = 'test-org'
const SECOND_ORG_NAME = 'Acme Corp'
const SECOND_ORG_SLUG = 'acme'
const TEST_USER_EMAIL = process.env.TEST_USER_LOGIN || 'user@tinycld.org'
const TEST_USER_PASSWORD = process.env.TEST_USER_PW || 'TestUser1234!'
const TEST_USER_NAME = 'Test User'

function htmlBlob(html: string) {
    return new File([html], 'body.html', { type: 'text/html' })
}

function todayAt(dayOffset: number, hour: number, minute = 0) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + dayOffset)
    d.setHours(hour, minute, 0, 0)
    return d.toISOString()
}

interface OrgSeedContext {
    user: { id: string; email: string; name: string }
    org: { id: string }
    userOrg: { id: string }
}

const collectionCache = new Map<string, boolean>()
async function hasCollection(pb: PocketBase, name: string): Promise<boolean> {
    const cached = collectionCache.get(name)
    if (cached !== undefined) return cached
    try {
        await pb.collections.getOne(name)
        collectionCache.set(name, true)
        return true
    } catch {
        collectionCache.set(name, false)
        return false
    }
}

async function seedSecondOrg(pb: PocketBase, ctx: OrgSeedContext) {
    log('Seeding second org (light):', SECOND_ORG_SLUG)

    // --- Contacts (3) ---
    if (await hasCollection(pb, 'contacts')) {
        const contacts = [
            {
                first_name: 'Lena',
                last_name: 'Ortiz',
                email: 'lena@acmecorp.com',
                company: 'Acme Corp',
                job_title: 'CEO',
            },
            {
                first_name: 'Raj',
                last_name: 'Patel',
                email: 'raj@acmecorp.com',
                company: 'Acme Corp',
                job_title: 'CTO',
            },
            {
                first_name: 'Sophie',
                last_name: 'Liu',
                email: 'sophie@vendor.io',
                company: 'Vendor Inc',
                job_title: 'Account Manager',
            },
        ]
        for (const c of contacts) {
            await pb.collection('contacts').create({ ...c, owner: ctx.userOrg.id })
        }
        log('  Created 3 contacts')
    } else {
        log('  skipped contacts (not linked)')
    }

    // --- Mail (2 threads) ---
    if (!(await hasCollection(pb, 'mail_domains'))) {
        log('  skipped mail (not linked)')
    } else {
        let domain: { id: string }
        try {
            domain = await pb
                .collection('mail_domains')
                .getFirstListItem(`org = "${ctx.org.id}" && domain = "acmecorp.com"`)
        } catch {
            domain = await pb.collection('mail_domains').create({
                org: ctx.org.id,
                domain: 'acmecorp.com',
                verified: true,
            })
        }

        let mailbox: { id: string }
        try {
            mailbox = await pb
                .collection('mail_mailboxes')
                .getFirstListItem(`address = "user" && domain = "${domain.id}"`)
        } catch {
            mailbox = await pb.collection('mail_mailboxes').create({
                address: 'user',
                domain: domain.id,
                display_name: ctx.user.name,
                type: 'personal',
            })
            await pb.collection('mail_mailbox_members').create({
                mailbox: mailbox.id,
                user_org: ctx.userOrg.id,
                role: 'owner',
            })
        }

        const threads = [
            {
                subject: 'Welcome to Acme Corp',
                snippet: 'Hi! Welcome aboard. Here are some resources to get you started.',
                latest_date: '2026-04-10 09:00:00.000Z',
                folder: 'inbox',
                is_read: true,
                is_starred: false,
                messages: [
                    {
                        sender_name: 'Lena Ortiz',
                        sender_email: 'lena@acmecorp.com',
                        recipients_to: [{ name: ctx.user.name, email: 'user@acmecorp.com' }],
                        date: '2026-04-10 09:00:00.000Z',
                        subject: 'Welcome to Acme Corp',
                        snippet: 'Hi! Welcome aboard.',
                        body_html:
                            '<p>Hi!</p><p>Welcome aboard. Here are some resources to get you started with the team.</p><p>Best,<br/>Lena</p>',
                    },
                ],
            },
            {
                subject: 'Q3 vendor contract review',
                snippet: 'Please review the attached vendor contract before end of week.',
                latest_date: '2026-04-11 14:30:00.000Z',
                folder: 'inbox',
                is_read: false,
                is_starred: true,
                messages: [
                    {
                        sender_name: 'Sophie Liu',
                        sender_email: 'sophie@vendor.io',
                        recipients_to: [{ name: ctx.user.name, email: 'user@acmecorp.com' }],
                        date: '2026-04-11 14:30:00.000Z',
                        subject: 'Q3 vendor contract review',
                        snippet: 'Please review the attached vendor contract.',
                        body_html:
                            '<p>Hi,</p><p>Please review the attached vendor contract before end of week. Let me know if you have questions.</p><p>Thanks,<br/>Sophie</p>',
                    },
                ],
            },
        ]

        for (const thread of threads) {
            const threadRecord = await pb.collection('mail_threads').create({
                mailbox: mailbox.id,
                subject: thread.subject,
                snippet: thread.snippet,
                message_count: thread.messages.length,
                latest_date: thread.latest_date,
                participants: thread.messages.map(m => ({
                    name: m.sender_name,
                    email: m.sender_email,
                })),
            })

            for (let i = 0; i < thread.messages.length; i++) {
                const msg = thread.messages[i]
                const formData = new FormData()
                formData.append('thread', threadRecord.id)
                formData.append('sender_name', msg.sender_name)
                formData.append('sender_email', msg.sender_email)
                formData.append('recipients_to', JSON.stringify(msg.recipients_to))
                formData.append('recipients_cc', JSON.stringify([]))
                formData.append('date', msg.date)
                formData.append('subject', msg.subject)
                formData.append('snippet', msg.snippet)
                formData.append('has_attachments', 'false')
                formData.append('body_html', htmlBlob(msg.body_html))
                formData.append(
                    'message_id',
                    `<acme-${thread.subject.replace(/\s/g, '-').slice(0, 20)}-${i}@acmecorp.com>`
                )
                await pb.collection('mail_messages').create(formData)
            }

            await pb.collection('mail_thread_state').create({
                thread: threadRecord.id,
                user_org: ctx.userOrg.id,
                folder: thread.folder,
                is_read: thread.is_read,
                is_starred: thread.is_starred,
            })
        }
        log('  Created 2 mail threads')
    }

    // --- Calendar (2 events) ---
    if (!(await hasCollection(pb, 'calendar_calendars'))) {
        log('  skipped calendar (not linked)')
    } else {
        const calendar = await pb.collection('calendar_calendars').create({
            org: ctx.org.id,
            name: 'Acme Calendar',
            description: 'Main calendar',
            color: 'purple',
        })
        await pb.collection('calendar_members').create({
            calendar: calendar.id,
            user_org: ctx.userOrg.id,
            role: 'owner',
        })

        const events = [
            {
                title: 'Acme weekly standup',
                start: todayAt(1, 10, 0),
                end: todayAt(1, 10, 30),
                description: 'Weekly team sync',
            },
            {
                title: 'Q3 planning kickoff',
                start: todayAt(3, 14, 0),
                end: todayAt(3, 15, 30),
                description: 'Review priorities for next quarter',
            },
        ]
        for (const event of events) {
            await pb.collection('calendar_events').create({
                calendar: calendar.id,
                title: event.title,
                start: event.start,
                end: event.end,
                description: event.description,
                created_by: ctx.userOrg.id,
                busy_status: 'busy',
                visibility: 'default',
            })
        }
        log('  Created 1 calendar with 2 events')
    }

    // --- Drive (1 folder + 1 text file) ---
    if (!(await hasCollection(pb, 'drive_items'))) {
        log('  skipped drive (not linked)')
    } else {
        const folder = await pb.collection('drive_items').create({
            org: ctx.org.id,
            name: 'Shared Documents',
            type: 'folder',
            created_by: ctx.userOrg.id,
        })

        const textContent = new File(
            ['# Acme Corp\n\nWelcome to the shared drive. Add files and folders here.'],
            'welcome.md',
            { type: 'text/markdown' }
        )
        const fileForm = new FormData()
        fileForm.append('org', ctx.org.id)
        fileForm.append('name', 'welcome.md')
        fileForm.append('type', 'file')
        fileForm.append('parent', folder.id)
        fileForm.append('created_by', ctx.userOrg.id)
        fileForm.append('mime_type', 'text/markdown')
        fileForm.append('size', String(textContent.size))
        fileForm.append('file', textContent)
        await pb.collection('drive_items').create(fileForm)
        log('  Created 1 folder with 1 file')
    }

    log('Second org seeding complete')
}

async function main() {
    const config = parseArgs()
    log('Connecting to PocketBase at', config.url)
    const pb = new PocketBase(config.url)

    log('Authenticating as superuser...')
    await pb.collection('_superusers').authWithPassword(config.adminEmail, config.adminPassword)

    let user: { id: string }
    try {
        user = await pb.collection('users').getFirstListItem(`email = "${TEST_USER_EMAIL}"`)
        log('Found existing test user:', TEST_USER_EMAIL)
    } catch {
        log('Creating test user:', TEST_USER_EMAIL)
        user = await pb.collection('users').create({
            email: TEST_USER_EMAIL,
            password: TEST_USER_PASSWORD,
            passwordConfirm: TEST_USER_PASSWORD,
            name: TEST_USER_NAME,
            emailVisibility: true,
            verified: true,
        })
    }

    let org: { id: string }
    try {
        org = await pb.collection('orgs').getFirstListItem(`slug = "${TEST_ORG_SLUG}"`)
        log('Found existing org:', TEST_ORG_SLUG)
    } catch {
        log('Creating org:', TEST_ORG_SLUG)
        org = await pb.collection('orgs').create({
            name: TEST_ORG_NAME,
            slug: TEST_ORG_SLUG,
        })
    }

    let userOrg: { id: string; role: string }
    try {
        userOrg = await pb
            .collection('user_org')
            .getFirstListItem(`user = "${user.id}" && org = "${org.id}"`)
        if (userOrg.role !== 'owner') {
            log(`Updating test user role from "${userOrg.role}" to "owner"`)
            userOrg = await pb.collection('user_org').update(userOrg.id, { role: 'owner' })
        } else {
            log('Found existing user_org membership (role: owner)')
        }
    } catch {
        log('Creating user_org membership (role: owner)')
        userOrg = await pb.collection('user_org').create({
            org: org.id,
            user: user.id,
            role: 'owner',
        })
    }

    // Run package seeds for primary org
    const seedContext = {
        user: { id: user.id, email: TEST_USER_EMAIL, name: TEST_USER_NAME },
        org,
        userOrg,
    }
    const pkgEntries = Object.entries(packageSeeds)
    log(`Running ${pkgEntries.length} package seed(s)...`)
    for (const [slug, seedFn] of pkgEntries) {
        log(`  → ${slug}`)
        await seedFn(pb, seedContext)
        log(`  ✓ ${slug} done`)
    }

    // Create second org with light seed data
    let org2: { id: string }
    try {
        org2 = await pb.collection('orgs').getFirstListItem(`slug = "${SECOND_ORG_SLUG}"`)
        log('Found existing org:', SECOND_ORG_SLUG)
    } catch {
        log('Creating org:', SECOND_ORG_SLUG)
        org2 = await pb.collection('orgs').create({
            name: SECOND_ORG_NAME,
            slug: SECOND_ORG_SLUG,
        })
    }

    let userOrg2: { id: string }
    try {
        userOrg2 = await pb
            .collection('user_org')
            .getFirstListItem(`user = "${user.id}" && org = "${org2.id}"`)
        log('Found existing user_org for', SECOND_ORG_SLUG)
    } catch {
        log('Creating user_org membership for', SECOND_ORG_SLUG)
        userOrg2 = await pb.collection('user_org').create({
            org: org2.id,
            user: user.id,
            role: 'owner',
        })
    }

    await seedSecondOrg(pb, {
        user: { id: user.id, email: TEST_USER_EMAIL, name: TEST_USER_NAME },
        org: org2,
        userOrg: userOrg2,
    })

    log('Seeding complete!')
    process.exit(0)
}

main().catch(err => {
    logError('Failed:', err)
    if (err?.response) {
        logError('Response:', JSON.stringify(err.response, null, 2))
    }
    process.exit(1)
})
