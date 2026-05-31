import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.describe('Offline overlay', () => {
    test('appears when the browser goes offline and dismisses on recovery', async ({
        page,
        context,
    }) => {
        await login(page)

        // After login the org-index route redirects to the first installed
        // package's page, which lazy-loads its sidebar + screen chunks. If
        // we go offline while those are still in flight, React.lazy
        // surfaces a "Failed to fetch" error overlay (in dev mode) that
        // covers our actual offline-overlay. Wait for the package's
        // Suspense boundary to unsuspend (signalled by core's
        // package-sidebar-mounted testID) so no chunk fetches are racing
        // the offline toggle.
        await page.getByTestId('package-sidebar-mounted').waitFor({ state: 'attached' })

        await expect(page.getByTestId('offline-overlay')).toBeHidden()

        await context.setOffline(true)
        await expect(page.getByTestId('offline-overlay')).toBeVisible({ timeout: 3_000 })
        await expect(page.getByText("You're offline")).toBeVisible()

        await context.setOffline(false)
        await expect(page.getByTestId('offline-overlay')).toBeHidden({ timeout: 2_000 })
    })
})
