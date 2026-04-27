/**
 * Side-effect-only module that hands the app's config to `@tinycld/core`
 * before any other module gets a chance to read it.
 *
 * This must be imported *before* anything else from `@tinycld/core` so the
 * static-import phase initializes core's config-reading modules
 * (`server-address`, `sentry`, `build-mode`, …) with `configureCore`
 * already having run. Module imports execute in source order during the
 * import phase, so a top-level statement like `configureCore(appConfig)`
 * in app/_layout.tsx fires *after* every transitive import — too late.
 *
 * Usage:
 *   import '~/lib/configure-core' // must be the first import in _layout
 *   import '~/global.css'
 *   …
 */
import { configureCore } from '@tinycld/core'

import { appConfig } from './app-config'

configureCore(appConfig)
