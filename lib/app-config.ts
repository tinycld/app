import type { CoreConfig } from '@tinycld/core'

/**
 * TinyCld-specific runtime configuration handed to `@tinycld/core` at boot.
 * Change these values (plus the assets/ tree and app.json) to rebrand the
 * app without touching core.
 */
export const appConfig: CoreConfig = {
    brandName: 'TinyCld',
    // Web is always same-origin via webShortcut. Native uses the
    // server-picker UI on first launch, persisted to AsyncStorage. Neither
    // path consults serverShortcuts, so it stays empty.
    serverShortcuts: {},
    webShortcut: () => {
        if (typeof window === 'undefined') return null
        return window.location.origin
    },
    defaultServer: 'https://tinycld.org',
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: process.env.EXPO_PUBLIC_ENV,
    release: process.env.EXPO_PUBLIC_GIT_COMMIT,
    reviewMode: process.env.EXPO_PUBLIC_APP_REVIEW_MODE === '1',
    demoPassword: process.env.EXPO_PUBLIC_DEMO_PASSWORD,
    demoEmail: 'appreview@tinycld.org',
    privacyUrl: 'https://tinycld.org/privacy',
    sourceUrl: 'https://github.com/tinycld/tinycld',
}
