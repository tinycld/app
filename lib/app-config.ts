import type { CoreConfig } from '@tinycld/core'

/**
 * TinyCld-specific runtime configuration handed to `@tinycld/core` at boot.
 * Change these values (plus the assets/ tree and app.json) to rebrand the
 * app without touching core.
 */
export const appConfig: CoreConfig = {
    brandName: 'TinyCld',
    serverShortcuts: {
        dev: 'https://localhost:7090',
        app: 'https://tinycld.org',
        test: 'http://127.0.0.1:7091',
    },
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
    sourceUrl: 'https://github.com/tinycld/core',
}
