import { expect, test } from '@playwright/test'
import { clearEmailLog, extractFirstLink, waitForEmailTo } from './email-log-helpers'
import { login, ORG_SLUG, TEST_USER_EMAIL, TEST_USER_PASSWORD } from './helpers'

// End-to-end invite flow:
//   1. Owner signs in and invites a fresh user via Settings → Members.
//   2. The Go user_org hook mints an invite_tokens row and writes an email to
//      the email-log file (SKIP_SENDING_MAIL + TINYCLD_EMAIL_LOG).
//   3. The invited user visits the /accept-invite/{token} link, sets a password,
//      and is auto-logged-in and redirected to /a/{slug}.
//   4. The invited user signs out, then signs back in with the new password.

test.describe('Invite flow', () => {
    // Unique email per run — the test DB is reset across runs but not between tests.
    const inviteEmail = `invitee-${Date.now()}@example.com`
    const invitePassword = 'BrandNewPass1!'

    test('owner invites user, user sets password, logs out, logs back in', async ({ page }) => {
        clearEmailLog()

        // --- 1. Owner signs in and sends an invite ---
        await login(page)

        await page.goto(`/a/${ORG_SLUG}/settings/members`)
        await expect(page.getByText('Invite Member', { exact: true })).toBeVisible({
            timeout: 10_000,
        })

        // The TextInput custom component sets testID={name} — so the invite form's
        // "email" field is a stable selector regardless of the labels/placeholders.
        await page.getByTestId('email').fill(inviteEmail)
        await page.getByText('Send Invite', { exact: true }).click()

        // Wait for the form to reset — it clears the email field on success.
        await expect(page.getByText('Inviting...')).toHaveCount(0, { timeout: 10_000 })

        // --- 2. Email is captured on disk ---
        const email = await waitForEmailTo(inviteEmail, {
            subjectMatch: /invited to/i,
            timeoutMs: 10_000,
        })
        expect(email.subject).toMatch(/invited to/i)

        // Pull the accept-invite path (token part) from the email body. Production
        // links use app.Settings().Meta.AppURL which isn't set in tests, so the
        // URL hostname may point to localhost:8090 — we only need the token.
        const link = extractFirstLink(email, /https?:\/\/[^\s"'<>]*\/accept-invite\/[0-9a-f]{64}/)
        const tokenMatch = link.match(/\/accept-invite\/([0-9a-f]{64})/)
        expect(tokenMatch).not.toBeNull()
        const token = tokenMatch![1]

        // --- 3. Invited user accepts the invite in a fresh browser context ---
        // Use a new context so the owner's auth doesn't bleed in.
        const inviteePage = await page.context().browser()!.newContext()
        const invitee = await inviteePage.newPage()

        await invitee.goto(`/accept-invite/${token}`)
        await expect(invitee.getByText(/Welcome to/i)).toBeVisible({ timeout: 10_000 })

        await invitee.getByTestId('password').fill(invitePassword)
        await invitee.getByTestId('confirmPassword').fill(invitePassword)
        await invitee.getByText(/Set password and sign in/i).click()

        // Auto-login + router.replace should land us on /a/{slug}.
        await invitee.waitForURL(new RegExp(`/a/${ORG_SLUG}`), { timeout: 15_000 })

        // --- 4. Sign out, sign back in with the new password ---
        // The user menu lives in the sidebar; it exposes a "Sign out" menu item.
        // Rather than clicking through the menu chrome, clear auth directly —
        // that's what the UserMenu does internally, and it's more resilient to
        // menu layout changes.
        await invitee.evaluate(() => {
            window.localStorage.clear()
            window.sessionStorage.clear()
        })
        await invitee.goto('/')

        // Back to the login modal — sign in as the invitee with their new creds.
        await invitee.getByPlaceholder('you@example.com').fill(inviteEmail)
        await invitee.getByPlaceholder('Password').fill(invitePassword)
        await invitee.getByText('Sign in', { exact: true }).last().click()
        await invitee.waitForURL(/\/a\//, { timeout: 15_000 })

        // Sanity: URL is under the owner's org (the invitee is now a member).
        expect(invitee.url()).toContain(`/a/${ORG_SLUG}`)

        // Guard: original test user can still sign in (password unchanged).
        // This catches regressions where accept-invite accidentally overwrites
        // the wrong user.
        await invitee.evaluate(() => {
            window.localStorage.clear()
            window.sessionStorage.clear()
        })
        await invitee.goto('/')
        await invitee.getByPlaceholder('you@example.com').fill(TEST_USER_EMAIL)
        await invitee.getByPlaceholder('Password').fill(TEST_USER_PASSWORD)
        await invitee.getByText('Sign in', { exact: true }).last().click()
        await invitee.waitForURL(/\/a\//, { timeout: 15_000 })

        await inviteePage.close()
    })
})
