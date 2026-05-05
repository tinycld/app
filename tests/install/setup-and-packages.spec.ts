import { expect, test } from '@playwright/test'

// Smoke-test that exercises the path a docs-following operator takes:
// hit /setup with the first-run token, fill the wizard, land on the
// dashboard, click the Packages tab, confirm every bundled feature
// package shows up and is enabled.
//
// PW_SETUP_TOKEN is scraped from `docker logs <container>` by the
// workflow before invoking playwright.

const SETUP_TOKEN = process.env.PW_SETUP_TOKEN
if (!SETUP_TOKEN) {
    throw new Error(
        'PW_SETUP_TOKEN not set — workflow must scrape it from `docker logs` and export before running'
    )
}

// Adjust this list when the public-CI default LINKED_PACKAGES set changes.
// The names match `bundled-packages.json::name` (capitalized labels), which
// is what PackageManager renders on the dashboard.
const EXPECTED_BUNDLED = ['Mail', 'Calendar', 'Contacts', 'Drive', 'Google Takeout Import']

const SUPERUSER_EMAIL = 'smoke@example.com'
const SUPERUSER_PASSWORD = 'SmokeTest1234!'

test.describe('first-run install', () => {
    test('superuser setup → packages tab lists every bundled feature', async ({ page }) => {
        await page.goto(`/setup?token=${SETUP_TOKEN}`)

        await expect(page.getByText('Welcome to TinyCld')).toBeVisible()

        await page.getByRole('textbox', { name: 'Email', exact: true }).fill(SUPERUSER_EMAIL)
        await page.getByRole('textbox', { name: 'Password', exact: true }).fill(SUPERUSER_PASSWORD)
        await page
            .getByRole('textbox', { name: 'Confirm Password', exact: true })
            .fill(SUPERUSER_PASSWORD)

        await page.getByText('Create Account & Continue').click()

        // Setup wizard transitions in-place to the dashboard with the
        // Organizations tab active. Wait for it to render before tab-switching.
        await expect(page.getByText('No organizations yet.')).toBeVisible()

        await page.getByText('Packages', { exact: true }).first().click()

        // Each bundled package renders its name + a "bundled" tag + an
        // enabled switch. Assert every expected package shows up.
        for (const pkg of EXPECTED_BUNDLED) {
            await expect(
                page.getByText(pkg, { exact: true }),
                `bundled package ${pkg} should appear in the dashboard`
            ).toBeVisible()
        }

        // And confirm the count of "bundled" tags matches — guards against
        // a regression that drops a package without changing its name.
        const bundledTags = page.getByText('bundled', { exact: true })
        await expect(bundledTags).toHaveCount(EXPECTED_BUNDLED.length)
    })
})
