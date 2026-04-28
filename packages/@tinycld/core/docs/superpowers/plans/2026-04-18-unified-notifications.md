# Unified Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered `showToast` + `useNotify` usage with a single event-first `notify.emit()` API routed through typed channels (toast, bell, OS).

**Architecture:** A module-level `notify` object dispatches typed events (`NotificationEvents`) through an `eventRegistry` (event → channel list) to independent channel classes implementing `NotifyChannel`. Org/user context is synced from an inner layout component into a module-level snapshot so non-hook callers can emit events.

**Tech Stack:** TypeScript, React Native / Expo, Vitest, Zustand (`~/lib/store`), pbtsdb (`~/lib/pocketbase`, `~/lib/mutations`), React Hook Form, PocketBase.

**Spec:** `docs/superpowers/specs/2026-04-18-unified-notifications-design.md`

---

## File structure

New files under `lib/notify/`:

```
lib/notify/
├── index.ts                    # barrel: exports { notify, NotifyEventName, NotificationEvents }
├── events.ts                   # NotificationEvents type map
├── registry.ts                 # eventRegistry + EventConfig + Variant + ChannelName
├── context.ts                  # module-level org/user snapshot
├── dispatcher.ts               # notify.emit() + channels registry
├── channels/
│   ├── types.ts                # NotifyChannel + DispatchInput
│   ├── toast.ts                # ToastChannel
│   ├── bell.ts                 # BellChannel
│   └── os.ts                   # OsChannel
└── __tests__/
    ├── dispatcher.test.ts
    ├── toast.test.ts
    ├── bell.test.ts
    └── os.test.ts
```

New component:

```
components/NotifyContextSync.tsx   # zero-render hook wrapper that feeds context.ts
```

Modified files:
- `app/a/[orgSlug]/_layout.tsx` — mount `<NotifyContextSync />`
- `lib/errors.ts` — `handleMutationErrorsWithForm` emits `mutation.error` for non-field branch
- `packages/mail/hooks/useSendEmail.ts` — migrate `showToast` → `notify.emit`
- `packages/mail/components/ComposeWindow.tsx` — migrate
- `components/workspace/ImportNotifier.tsx` — migrate `useNotify` → `notify.emit`
- `components/NotificationListener.tsx` — migrate its `showToast` call (keep the component)

Removed files (commit 3):
- `lib/toast.ts`
- `lib/use-notify.ts`

Untouched:
- `lib/stores/toast-store.ts` (still the backing store)
- `components/Toast.tsx` (renderer)
- `components/NotificationBell.tsx`, `components/NotificationDrawer.tsx`
- `lib/notifications.ts` (used by calendar; wrapped by OsChannel)
- `notifications` PB collection
- `FormErrorSummary` (out of scope)

---

## Conventions

- All imports use the `~/` alias.
- Commit style: `type(scope): summary` (lowercase, no period).
- Tests use Vitest, directly assert against Zustand stores via `.getState()`, no renderer for store-level tests.
- Run `bun run checks` (lint + typecheck) and `bun run test:unit` before each commit.
- Each task ends with a commit. Subagents MUST run the checks locally before committing.

---

## Commit 1: Infrastructure

New module shipped alongside `showToast` / `useNotify`. No call sites migrated yet. At the end of this commit, `bun run checks` and `bun run test:unit` both pass, but the new API has no production callers.

### Task 1: Create channel types

**Files:**
- Create: `lib/notify/channels/types.ts`

- [ ] **Step 1: Write the file**

```ts
// lib/notify/channels/types.ts
import type { NotifyEventName } from '~/lib/notify/events'
import type { Variant } from '~/lib/notify/registry'

export type DispatchInput = {
    event: NotifyEventName
    title: string
    body?: string
    url?: string
    data?: Record<string, unknown>
    variant: Variant
}

export interface NotifyChannel {
    readonly name: 'toast' | 'bell' | 'os'
    dispatch(input: DispatchInput): void | Promise<void>
}
```

- [ ] **Step 2: No test yet** — types only, exercised by later tasks.

### Task 2: Create the event type map with initial events

**Files:**
- Create: `lib/notify/events.ts`

- [ ] **Step 1: Write the file**

```ts
// lib/notify/events.ts
/**
 * Central list of every user-facing notification event.
 * Keys follow `<domain>.<verb_past>`. Adding an entry here is step 1 of registering
 * an event — also add a matching entry to eventRegistry in ./registry.ts.
 */
export type NotificationEvents = {
    'mail.send_failed': { error: string }
    'mail.send_blocked': { reason: string }
    'import.complete': { source: 'google-takeout' | 'csv'; count: number }
    'import.failed': { source: string; error: string }
    'mutation.error': { operation: string; error: string }
}

export type NotifyEventName = keyof NotificationEvents
```

- [ ] **Step 2: No test yet.**

### Task 3: Create the event registry

**Files:**
- Create: `lib/notify/registry.ts`

- [ ] **Step 1: Write the file**

```ts
// lib/notify/registry.ts
import type { NotifyEventName } from '~/lib/notify/events'

export type ChannelName = 'toast' | 'bell' | 'os'
export type Variant = 'info' | 'success' | 'warning' | 'error'

export type EventConfig = {
    channels: ChannelName[]
    variant: Variant
}

/**
 * Policy: which channels fire for each event, and the visual variant to use.
 * TypeScript requires one entry per NotifyEventName.
 */
export const eventRegistry: Record<NotifyEventName, EventConfig> = {
    'mail.send_failed':  { channels: ['toast'],         variant: 'error'   },
    'mail.send_blocked': { channels: ['toast'],         variant: 'warning' },
    'import.complete':   { channels: ['toast', 'bell'], variant: 'success' },
    'import.failed':     { channels: ['toast', 'bell'], variant: 'error'   },
    'mutation.error':    { channels: ['toast'],         variant: 'error'   },
}
```

- [ ] **Step 2: No test yet.** The type check alone enforces "every event has a config."

### Task 4: Create the context module

**Files:**
- Create: `lib/notify/context.ts`
- Test: `lib/notify/__tests__/context.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/notify/__tests__/context.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { clearNotifyContext, getNotifyContext, setNotifyContext } from '~/lib/notify/context'

describe('notify/context', () => {
    afterEach(() => {
        clearNotifyContext()
    })

    it('returns null when nothing is set', () => {
        expect(getNotifyContext()).toBeNull()
    })

    it('round-trips a context snapshot', () => {
        setNotifyContext({ orgId: 'o1', userOrgId: 'uo1', userId: 'u1' })
        expect(getNotifyContext()).toEqual({
            orgId: 'o1',
            userOrgId: 'uo1',
            userId: 'u1',
        })
    })

    it('clearNotifyContext resets to null', () => {
        setNotifyContext({ orgId: 'o1', userOrgId: 'uo1', userId: 'u1' })
        clearNotifyContext()
        expect(getNotifyContext()).toBeNull()
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit lib/notify/__tests__/context.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/notify/context.ts
export type NotifyContext = {
    orgId: string
    userOrgId: string
    userId: string
}

let current: NotifyContext | null = null

export function setNotifyContext(ctx: NotifyContext): void {
    current = ctx
}

export function clearNotifyContext(): void {
    current = null
}

export function getNotifyContext(): NotifyContext | null {
    return current
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit lib/notify/__tests__/context.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/notify/context.ts lib/notify/__tests__/context.test.ts lib/notify/events.ts lib/notify/registry.ts lib/notify/channels/types.ts
git commit -m "feat(notify): add event types, registry, and context scaffolding"
```

### Task 5: Implement ToastChannel

**Files:**
- Create: `lib/notify/channels/toast.ts`
- Test: `lib/notify/__tests__/toast.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/notify/__tests__/toast.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { toastChannel } from '~/lib/notify/channels/toast'
import { useToastStore } from '~/lib/stores/toast-store'

describe('ToastChannel', () => {
    beforeEach(() => {
        useToastStore.setState({ toasts: [] })
    })

    afterEach(() => {
        useToastStore.setState({ toasts: [] })
    })

    it('inserts a toast with the correct variant, title, body, and duration', () => {
        toastChannel.dispatch({
            event: 'mail.sent',
            title: 'Message sent',
            body: 'To a@b.com',
            variant: 'success',
        })
        const toasts = useToastStore.getState().toasts
        expect(toasts).toHaveLength(1)
        expect(toasts[0]).toMatchObject({
            title: 'Message sent',
            body: 'To a@b.com',
            variant: 'success',
        })
    })

    it('omits body when not provided', () => {
        toastChannel.dispatch({
            event: 'mail.sent',
            title: 'Sent',
            variant: 'success',
        })
        const toasts = useToastStore.getState().toasts
        expect(toasts[0].title).toBe('Sent')
        expect(toasts[0].body).toBeUndefined()
    })

    it('reports its channel name', () => {
        expect(toastChannel.name).toBe('toast')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit lib/notify/__tests__/toast.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/notify/channels/toast.ts
import { useToastStore } from '~/lib/stores/toast-store'
import type { DispatchInput, NotifyChannel } from './types'

export const toastChannel: NotifyChannel = {
    name: 'toast',
    dispatch(input: DispatchInput) {
        useToastStore.getState().addToast({
            title: input.title,
            body: input.body,
            variant: input.variant,
            duration: 4000,
        })
    },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit lib/notify/__tests__/toast.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/notify/channels/toast.ts lib/notify/__tests__/toast.test.ts
git commit -m "feat(notify): add ToastChannel"
```

### Task 6: Implement BellChannel

Note: `BellChannel` needs to insert into the `notifications` PB collection. The `useStore` / pbtsdb collection is a hook-accessed singleton registered in `lib/pocketbase.ts`. For a module-level channel, we access the collection via the already-registered global object — see `lib/pocketbase.ts` for the `coreStores` export. The channel imports `coreStores` and uses `coreStores.notifications`.

First, verify that `coreStores` (or equivalent) is exported from `lib/pocketbase.ts`. If it isn't exported in a form usable at module level, add the export. The collection is created via `newCollection('notifications', ...)` at lib/pocketbase.ts:159.

**Files:**
- Create: `lib/notify/channels/bell.ts`
- Test: `lib/notify/__tests__/bell.test.ts`
- Modify: `lib/pocketbase.ts` (only if the notifications collection isn't already module-exportable)

- [ ] **Step 1: Verify/expose the notifications collection**

Read `lib/pocketbase.ts` around line 159. Confirm the `notifications` collection created by `newCollection` is exported directly (e.g., as `notificationsCollection` or inside a named `coreStores` export). If not, add `export const notificationsCollection = notifications` after the declaration.

- [ ] **Step 2: Write the failing test**

```ts
// lib/notify/__tests__/bell.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bellChannel } from '~/lib/notify/channels/bell'
import { clearNotifyContext, setNotifyContext } from '~/lib/notify/context'

// Mock the notifications collection — we only want to assert on the insert call shape.
vi.mock('~/lib/pocketbase', async () => {
    const actual = await vi.importActual<object>('~/lib/pocketbase')
    return {
        ...actual,
        notificationsCollection: {
            insert: vi.fn(() => ({ isPersisted: { promise: Promise.resolve() } })),
        },
    }
})

describe('BellChannel', () => {
    beforeEach(() => {
        clearNotifyContext()
    })

    afterEach(() => {
        vi.clearAllMocks()
        clearNotifyContext()
    })

    it('inserts a notification row with resolved context and input fields', async () => {
        setNotifyContext({ orgId: 'o1', userOrgId: 'uo1', userId: 'u1' })

        await bellChannel.dispatch({
            event: 'import.complete',
            title: 'Import done',
            body: '42 contacts',
            url: '/a/acme/contacts',
            data: { source: 'google-takeout', count: 42 },
            variant: 'success',
        })

        const { notificationsCollection } = await import('~/lib/pocketbase')
        expect(notificationsCollection.insert).toHaveBeenCalledTimes(1)
        const arg = (notificationsCollection.insert as unknown as ReturnType<typeof vi.fn>).mock
            .calls[0][0]
        expect(arg).toMatchObject({
            user: 'u1',
            org: 'o1',
            type: 'import.complete',
            title: 'Import done',
            body: '42 contacts',
            url: '/a/acme/contacts',
            metadata: { source: 'google-takeout', count: 42 },
            read: false,
            dismissed: false,
        })
        expect(typeof arg.id).toBe('string')
    })

    it('no-ops and does not throw when context is missing', async () => {
        await expect(
            bellChannel.dispatch({
                event: 'import.complete',
                title: 'x',
                variant: 'success',
            })
        ).resolves.toBeUndefined()

        const { notificationsCollection } = await import('~/lib/pocketbase')
        expect(notificationsCollection.insert).not.toHaveBeenCalled()
    })

    it('reports its channel name', () => {
        expect(bellChannel.name).toBe('bell')
    })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test:unit lib/notify/__tests__/bell.test.ts`
Expected: FAIL — channel file doesn't exist.

- [ ] **Step 4: Write minimal implementation**

```ts
// lib/notify/channels/bell.ts
import { newRecordId } from 'pbtsdb/core'
import { getNotifyContext } from '~/lib/notify/context'
import { notificationsCollection } from '~/lib/pocketbase'
import type { DispatchInput, NotifyChannel } from './types'

export const bellChannel: NotifyChannel = {
    name: 'bell',
    async dispatch(input: DispatchInput) {
        const ctx = getNotifyContext()
        if (!ctx) {
            if (__DEV__) {
                // eslint-disable-next-line no-console
                console.warn(
                    `[notify] BellChannel skipped "${input.event}" — no org/user context`
                )
            }
            return
        }

        const tx = notificationsCollection.insert({
            id: newRecordId(),
            user: ctx.userId,
            org: ctx.orgId,
            type: input.event,
            package: 'core',
            title: input.title,
            body: input.body ?? '',
            url: input.url ?? '',
            metadata: input.data ?? {},
            read: false,
            dismissed: false,
        })
        await tx.isPersisted.promise
    },
}
```

Note on `__DEV__`: it's a global in React Native. If the test environment doesn't define it, the fallback is to declare it at the top of the file:

```ts
declare const __DEV__: boolean
```

Add the `declare` at the top if `bun run typecheck` complains.

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test:unit lib/notify/__tests__/bell.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/notify/channels/bell.ts lib/notify/__tests__/bell.test.ts lib/pocketbase.ts
git commit -m "feat(notify): add BellChannel backed by notifications collection"
```

### Task 7: Implement OsChannel

**Files:**
- Create: `lib/notify/channels/os.ts`
- Test: `lib/notify/__tests__/os.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/notify/__tests__/os.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { osChannel } from '~/lib/notify/channels/os'

vi.mock('~/lib/notifications', () => ({
    notify: vi.fn(() => Promise.resolve()),
}))

describe('OsChannel', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('forwards title/body/data to the platform notify helper', async () => {
        const { notify } = await import('~/lib/notifications')
        await osChannel.dispatch({
            event: 'import.complete',
            title: 'Done',
            body: '42',
            data: { count: 42 },
            variant: 'success',
        })
        expect(notify).toHaveBeenCalledWith({
            title: 'Done',
            body: '42',
            data: { count: 42 },
        })
    })

    it('reports its channel name', () => {
        expect(osChannel.name).toBe('os')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit lib/notify/__tests__/os.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/notify/channels/os.ts
import { notify as osNotify } from '~/lib/notifications'
import type { DispatchInput, NotifyChannel } from './types'

export const osChannel: NotifyChannel = {
    name: 'os',
    async dispatch(input: DispatchInput) {
        await osNotify({
            title: input.title,
            body: input.body,
            data: input.data,
        })
    },
}
```

The permission gating already lives inside `lib/notifications.ts::notify()` — it silently returns if permission isn't granted. No need to duplicate that here.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit lib/notify/__tests__/os.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/notify/channels/os.ts lib/notify/__tests__/os.test.ts
git commit -m "feat(notify): add OsChannel wrapping lib/notifications"
```

### Task 8: Implement the dispatcher and barrel export

**Files:**
- Create: `lib/notify/dispatcher.ts`
- Create: `lib/notify/index.ts`
- Test: `lib/notify/__tests__/dispatcher.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/notify/__tests__/dispatcher.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { __setChannelsForTests, notify } from '~/lib/notify/dispatcher'
import type { NotifyChannel } from '~/lib/notify/channels/types'

function makeChannel(name: NotifyChannel['name']) {
    return { name, dispatch: vi.fn() } satisfies NotifyChannel
}

describe('notify.emit', () => {
    afterEach(() => {
        __setChannelsForTests(null)
        vi.clearAllMocks()
    })

    it('dispatches to exactly the channels named in the registry', () => {
        const toast = makeChannel('toast')
        const bell = makeChannel('bell')
        const os = makeChannel('os')
        __setChannelsForTests({ toast, bell, os })

        notify.emit({
            event: 'import.complete',
            title: 'Done',
            body: '42 contacts',
            data: { source: 'google-takeout', count: 42 },
        })

        expect(toast.dispatch).toHaveBeenCalledTimes(1)
        expect(bell.dispatch).toHaveBeenCalledTimes(1)
        expect(os.dispatch).not.toHaveBeenCalled()
    })

    it('merges the registry variant into the dispatch input', () => {
        const toast = makeChannel('toast')
        __setChannelsForTests({ toast, bell: makeChannel('bell'), os: makeChannel('os') })

        notify.emit({ event: 'mail.send_failed', title: 'Oops', data: { error: 'timeout' } })

        expect(toast.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({ variant: 'error', title: 'Oops' })
        )
    })

    it('catches a synchronous channel throw and still runs later channels', () => {
        const toast = makeChannel('toast')
        toast.dispatch = vi.fn(() => {
            throw new Error('boom')
        })
        const bell = makeChannel('bell')
        __setChannelsForTests({ toast, bell, os: makeChannel('os') })

        expect(() =>
            notify.emit({
                event: 'import.complete',
                title: 'x',
                data: { source: 'csv', count: 1 },
            })
        ).not.toThrow()
        expect(bell.dispatch).toHaveBeenCalled()
    })

    it('swallows a channel rejection without affecting others', async () => {
        const toast = makeChannel('toast')
        toast.dispatch = vi.fn(() => Promise.reject(new Error('async-boom')))
        const bell = makeChannel('bell')
        __setChannelsForTests({ toast, bell, os: makeChannel('os') })

        notify.emit({
            event: 'import.complete',
            title: 'x',
            data: { source: 'csv', count: 1 },
        })

        // allow microtasks to flush
        await new Promise(r => setTimeout(r, 0))
        expect(bell.dispatch).toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit lib/notify/__tests__/dispatcher.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation of dispatcher**

```ts
// lib/notify/dispatcher.ts
import { bellChannel } from '~/lib/notify/channels/bell'
import { osChannel } from '~/lib/notify/channels/os'
import { toastChannel } from '~/lib/notify/channels/toast'
import type { DispatchInput, NotifyChannel } from '~/lib/notify/channels/types'
import type { NotificationEvents, NotifyEventName } from '~/lib/notify/events'
import { eventRegistry } from '~/lib/notify/registry'

export type NotifyInput<K extends NotifyEventName = NotifyEventName> = {
    event: K
    title: string
    body?: string
    url?: string
    data?: NotificationEvents[K]
}

type ChannelMap = Record<NotifyChannel['name'], NotifyChannel>

const defaultChannels: ChannelMap = {
    toast: toastChannel,
    bell: bellChannel,
    os: osChannel,
}

let activeChannels: ChannelMap = defaultChannels

/** Test-only: swap the channel map. Pass null to restore defaults. */
export function __setChannelsForTests(map: ChannelMap | null) {
    activeChannels = map ?? defaultChannels
}

function emit<K extends NotifyEventName>(input: NotifyInput<K>): void {
    const config = eventRegistry[input.event]
    if (!config) {
        // eslint-disable-next-line no-console
        console.error(`[notify] unknown event: ${input.event}`)
        return
    }

    const dispatchInput: DispatchInput = {
        event: input.event,
        title: input.title,
        body: input.body,
        url: input.url,
        data: input.data as Record<string, unknown> | undefined,
        variant: config.variant,
    }

    for (const channelName of config.channels) {
        const channel = activeChannels[channelName]
        try {
            const result = channel.dispatch(dispatchInput)
            if (result instanceof Promise) {
                result.catch(err => {
                    // eslint-disable-next-line no-console
                    console.error('[notify] channel rejected', channelName, err)
                })
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[notify] channel threw', channelName, err)
        }
    }
}

export const notify = { emit }
```

- [ ] **Step 4: Write the barrel export**

```ts
// lib/notify/index.ts
export { notify, type NotifyInput } from './dispatcher'
export type { NotifyEventName, NotificationEvents } from './events'
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `bun run test:unit lib/notify/`
Expected: PASS across dispatcher, toast, bell, os, context suites.

- [ ] **Step 6: Run full checks**

Run: `bun run checks`
Expected: typecheck + lint pass.

- [ ] **Step 7: Commit**

```bash
git add lib/notify/dispatcher.ts lib/notify/index.ts lib/notify/__tests__/dispatcher.test.ts
git commit -m "feat(notify): add event dispatcher with per-channel error isolation"
```

### Task 9: Add NotifyContextSync component and mount it

**Files:**
- Create: `components/NotifyContextSync.tsx`
- Modify: `app/a/[orgSlug]/_layout.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/NotifyContextSync.tsx
import { useEffect } from 'react'
import { useAuth } from '~/lib/auth'
import { clearNotifyContext, setNotifyContext } from '~/lib/notify/context'
import { useOrgInfo } from '~/lib/use-org-info'
import { useCurrentUserOrg } from '~/lib/use-current-user-org'
import { useOrgSlug } from '~/lib/use-org-slug'

/**
 * Syncs the current user + org identifiers into the module-level notify context
 * so non-hook callers (e.g. notify.emit) can reach them. Mounted once inside
 * the org layout; it re-runs whenever any identifier changes.
 */
export function NotifyContextSync() {
    const { user } = useAuth({ throwIfAnon: false })
    const orgSlug = useOrgSlug()
    const { orgId } = useOrgInfo()
    const userOrg = useCurrentUserOrg(orgSlug)

    useEffect(() => {
        if (!user?.id || !orgId || !userOrg?.id) {
            clearNotifyContext()
            return
        }
        setNotifyContext({ orgId, userOrgId: userOrg.id, userId: user.id })
    }, [user?.id, orgId, userOrg?.id])

    return null
}
```

Verify the actual shape of `useAuth({ throwIfAnon: false })` returns `{ user }` or `{ user, isInitializing, isLoggedIn, ... }` — check `lib/auth.ts`. If `user` may be null, the optional chain above handles it. If `useAuth()` without args is the standard form, match that; the existing `_layout.tsx` uses `useAuth({ throwIfAnon: false })` so copy that.

- [ ] **Step 2: Mount the component in the org layout**

Modify `app/a/[orgSlug]/_layout.tsx`. Add an import and render `<NotifyContextSync />` inside `OrgLayoutInner`, directly after `<ImportNotifier />`:

```tsx
import { NotifyContextSync } from '~/components/NotifyContextSync'
// ...
function OrgLayoutInner() {
    const auth = useAuth({ throwIfAnon: false })
    const isReady = !auth.isInitializing && auth.isLoggedIn

    return (
        <>
            <ActivePkgSync />
            <ImportNotifier />
            <NotifyContextSync />
            <WorkspaceLayout isReady={isReady} />
            {/* ... unchanged ... */}
        </>
    )
}
```

- [ ] **Step 3: Run full checks**

Run: `bun run checks && bun run test:unit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/NotifyContextSync.tsx app/a/[orgSlug]/_layout.tsx
git commit -m "feat(notify): sync org/user context into module-level snapshot"
```

### Task 10: Add an end-to-end smoke test

**Files:**
- Test: `lib/notify/__tests__/smoke.test.ts`

- [ ] **Step 1: Write the test**

```ts
// lib/notify/__tests__/smoke.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { notify } from '~/lib/notify'
import { useToastStore } from '~/lib/stores/toast-store'

describe('notify end-to-end (toast-only events)', () => {
    beforeEach(() => {
        useToastStore.setState({ toasts: [] })
    })
    afterEach(() => {
        useToastStore.setState({ toasts: [] })
    })

    it('import.complete lands a success toast (bell needs context — skipped here)', () => {
        notify.emit({
            event: 'import.complete',
            title: 'Import done',
            body: '42 contacts',
            data: { source: 'google-takeout', count: 42 },
        })
        const toasts = useToastStore.getState().toasts
        expect(toasts).toHaveLength(1)
        expect(toasts[0]).toMatchObject({
            title: 'Import done',
            variant: 'success',
        })
        // BellChannel no-ops without context — see bell.test.ts
    })

    it('mail.send_failed lands an error toast', () => {
        notify.emit({
            event: 'mail.send_failed',
            title: 'Send failed',
            body: 'network timeout',
            data: { error: 'timeout' },
        })
        expect(useToastStore.getState().toasts[0]).toMatchObject({
            variant: 'error',
        })
    })
})
```

- [ ] **Step 2: Run test**

Run: `bun run test:unit lib/notify/__tests__/smoke.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 3: Commit**

```bash
git add lib/notify/__tests__/smoke.test.ts
git commit -m "test(notify): end-to-end toast smoke test"
```

**End of Commit 1.** The new API is shipped and tested; no call sites use it yet.

---

## Commit 2: Migrate call sites

Replace every `showToast` and `useNotify` usage with `notify.emit`. Wire `mutation.error` into the form-error helper.

### Task 11: Migrate `packages/mail/hooks/useSendEmail.ts`

**Files:**
- Modify: `packages/mail/hooks/useSendEmail.ts`

- [ ] **Step 1: Read the file**

Confirm the current `showToast` call around line 54:

```ts
showToast({ title: 'Send failed', body: message, variant: 'error', duration: 8000 })
```

- [ ] **Step 2: Replace the call**

- Remove the `showToast` import.
- Add `import { notify } from '~/lib/notify'`.
- Replace the call with:

```ts
notify.emit({
    event: 'mail.send_failed',
    title: 'Send failed',
    body: message,
    data: { error: message },
})
```

(The hook has no success toast — success is delegated to the caller via `onSuccess`. Do not add one.)

- [ ] **Step 3: Run tests**

Run: `bun run test:unit` (covers mail package tests)
Expected: PASS. If an existing test asserts on `showToast` being called, update it to assert on the toast store state or the `notify.emit` import.

- [ ] **Step 4: Commit**

```bash
git add packages/mail/hooks/useSendEmail.ts
git commit -m "refactor(mail): route send failures through notify.emit"
```

### Task 12: Migrate `packages/mail/components/ComposeWindow.tsx`

**Files:**
- Modify: `packages/mail/components/ComposeWindow.tsx`

- [ ] **Step 1: Read the file**

Confirm the current `showToast` call around line 56 (readiness warning):

```ts
showToast({ title: "Can't send mail", body: readiness.message, variant, duration: 8000 })
```

The `variant` here is dynamic (warning/error based on readiness).

- [ ] **Step 2: Replace the call**

- Remove the `showToast` import.
- Add `import { notify } from '~/lib/notify'`.
- Replace with:

```ts
notify.emit({
    event: 'mail.send_blocked',
    title: "Can't send mail",
    body: readiness.message,
    data: { reason: readiness.message },
})
```

The `variant` is now controlled by the registry (`warning` for `mail.send_blocked`). If the existing code had a genuine error vs warning distinction, introduce a second event (e.g., `mail.send_config_error`) with `variant: 'error'` in the registry and branch on readiness state.

- [ ] **Step 3: Run checks**

Run: `bun run checks && bun run test:unit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/mail/components/ComposeWindow.tsx
git commit -m "refactor(mail): route send-blocked warnings through notify.emit"
```

### Task 13: Migrate `components/workspace/ImportNotifier.tsx`

**Files:**
- Modify: `components/workspace/ImportNotifier.tsx`

- [ ] **Step 1: Read the file**

Current code:

```ts
const { notify } = useNotify()
// ... on success:
notify({
    type: 'takeout_import_complete',
    package: 'contacts',
    title: '...',
    body: '...',
    url: '...',
})
// ... on error:
notify({
    type: 'takeout_import_error',
    package: 'contacts',
    title: '...',
    body: '...',
})
```

- [ ] **Step 2: Update the type map and registry**

In `lib/notify/events.ts`, the existing `import.complete` and `import.failed` entries already cover these — no new events needed. If the `url` or body strings depend on runtime data, keep passing them inline.

- [ ] **Step 3: Replace the hook usage**

- Remove `const { notify } = useNotify()` and the `useNotify` import.
- Add `import { notify } from '~/lib/notify'` at the top.
- Replace success call:

```ts
notify.emit({
    event: 'import.complete',
    title: '<existing title>',
    body: '<existing body>',
    url: '<existing url>',
    data: { source: 'google-takeout', count: <count from state> },
})
```

- Replace error call:

```ts
notify.emit({
    event: 'import.failed',
    title: '<existing title>',
    body: '<existing body>',
    data: { source: 'google-takeout', error: '<error message>' },
})
```

If a `count` isn't readily available in the error branch, pass `count: 0` to the success case only; `import.failed` doesn't need a count.

- [ ] **Step 4: Run checks**

Run: `bun run checks && bun run test:unit`
Expected: PASS. The bell renders from the `notifications` PB collection — since BellChannel inserts into the same collection, the `NotificationBell` unread count still updates.

- [ ] **Step 5: Commit**

```bash
git add components/workspace/ImportNotifier.tsx
git commit -m "refactor(import): route takeout notifications through notify.emit"
```

### Task 14: Migrate `components/NotificationListener.tsx`

**Files:**
- Modify: `components/NotificationListener.tsx`

The listener currently watches the `notifications` collection and toasts when new rows arrive. After commit 3, BellChannel is the only app-internal path that inserts rows, and each BellChannel insert is always paired with a toast (because events that include `'bell'` in their channel list also include `'toast'` today). The listener is therefore redundant for locally-originated notifications, but still useful for:

- Cross-device sync: if another client or a Go hook inserts a row, this listener surfaces it as a toast.

Keep the component, but migrate its `showToast` call to `notify.emit` with a dedicated `system.remote_notification` event so channels stay centrally controlled.

- [ ] **Step 1: Add the new event**

In `lib/notify/events.ts`:

```ts
'system.remote_notification': { sourceId: string }
```

In `lib/notify/registry.ts`:

```ts
'system.remote_notification': { channels: ['toast'], variant: 'info' },
```

- [ ] **Step 2: Replace the showToast call**

Replace:

```ts
showToast({
    title: newest.title,
    body: newest.body || undefined,
    variant: 'info',
})
```

with:

```ts
notify.emit({
    event: 'system.remote_notification',
    title: newest.title,
    body: newest.body || undefined,
    data: { sourceId: newest.id },
})
```

- Remove the `showToast` import, add `import { notify } from '~/lib/notify'`.

- [ ] **Step 3: Run checks**

Run: `bun run checks && bun run test:unit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/notify/events.ts lib/notify/registry.ts components/NotificationListener.tsx
git commit -m "refactor(notify): route remote-notification toasts through notify.emit"
```

### Task 15: Route non-field mutation errors through `notify.emit`

**Files:**
- Modify: `lib/errors.ts`

Currently, `handleMutationErrorsWithForm` sets field errors when it can and silently does nothing otherwise. Add an else branch that emits `mutation.error` with a caller-supplied operation label.

- [ ] **Step 1: Modify `handleMutationErrorsWithForm` signature and body**

Replace the current implementation:

```ts
export function handleMutationErrorsWithForm<T extends FieldValues = FieldValues>(
    form: FormErrorHandler<T> & { operation?: string }
) {
    return (error: unknown) => {
        const validationErrors = extractValidationErrors(error)

        if (validationErrors) {
            const formValues = form.getValues()
            const formFields = Object.keys(formValues as Record<string, unknown>)
            const errorFields = Object.keys(validationErrors)
            const unknownFields = errorFields.filter(field => !formFields.includes(field))

            if (unknownFields.length === 0) {
                for (const [field, message] of Object.entries(validationErrors)) {
                    form.setError(field as Path<T>, { type: 'manual', message })
                }
                return
            }
        }

        // Non-field or partially-unknown error: surface via notify.
        const message = errorToString(error)
        notify.emit({
            event: 'mutation.error',
            title: 'Something went wrong',
            body: message,
            data: { operation: form.operation ?? 'unknown', error: message },
        })
    }
}
```

Add `import { notify } from '~/lib/notify'` at the top of `lib/errors.ts`.

- [ ] **Step 2: Update the `FormErrorHandler` type**

```ts
export interface FormErrorHandler<T extends FieldValues = FieldValues> {
    setError: UseFormSetError<T>
    getValues: () => T
    operation?: string
}
```

- [ ] **Step 3: Add a test**

Create `lib/__tests__/handle-mutation-errors.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleMutationErrorsWithForm } from '~/lib/errors'
import { useToastStore } from '~/lib/stores/toast-store'

describe('handleMutationErrorsWithForm', () => {
    beforeEach(() => {
        useToastStore.setState({ toasts: [] })
    })
    afterEach(() => {
        useToastStore.setState({ toasts: [] })
        vi.restoreAllMocks()
    })

    it('sets field errors when they match form fields', () => {
        const setError = vi.fn()
        const getValues = () => ({ email: '', name: '' })
        const handler = handleMutationErrorsWithForm({ setError, getValues })
        handler({
            response: { data: { data: { email: { code: 'x', message: 'required' } } } },
        })
        expect(setError).toHaveBeenCalledWith(
            'email',
            expect.objectContaining({ message: 'required' })
        )
        expect(useToastStore.getState().toasts).toHaveLength(0)
    })

    it('emits mutation.error for non-field errors', () => {
        const setError = vi.fn()
        const getValues = () => ({ email: '' })
        const handler = handleMutationErrorsWithForm({
            setError,
            getValues,
            operation: 'save settings',
        })
        handler(new Error('Network unreachable'))
        const toasts = useToastStore.getState().toasts
        expect(toasts).toHaveLength(1)
        expect(toasts[0]).toMatchObject({
            title: 'Something went wrong',
            variant: 'error',
        })
        expect(toasts[0].body).toContain('Network unreachable')
    })
})
```

- [ ] **Step 4: Run checks**

Run: `bun run checks && bun run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/errors.ts lib/__tests__/handle-mutation-errors.test.ts
git commit -m "feat(notify): route non-field mutation errors through notify.emit"
```

### Task 16: Verify no remaining direct `showToast` / `useNotify` imports

**Files:**
- Read-only audit

- [ ] **Step 1: Grep for remaining imports**

Run:

```bash
rg "from '~/lib/toast'" -l
rg "from '~/lib/use-notify'" -l
rg "import .*showToast" -l
rg "import .*useNotify" -l
```

Expected: no matches. If any remain, migrate them following the patterns in tasks 11–14, then re-run.

- [ ] **Step 2: Run final checks for commit 2**

Run: `bun run checks && bun run test:unit`
Expected: PASS.

No commit needed — this is verification only.

**End of Commit 2.** Every user-facing notification now flows through `notify.emit`. The deprecated APIs still exist (no imports left) and will be deleted in commit 3.

---

## Commit 3: Remove deprecated APIs

### Task 17: Delete `lib/toast.ts` and `lib/use-notify.ts`

**Files:**
- Delete: `lib/toast.ts`
- Delete: `lib/use-notify.ts`

- [ ] **Step 1: Delete the files**

```bash
rm lib/toast.ts lib/use-notify.ts
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS. If it fails, a call site was missed — go back to the grep step in Task 16 and migrate it.

- [ ] **Step 3: Run full checks**

Run: `bun run checks && bun run test:unit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(notify): remove deprecated showToast and useNotify"
```

### Task 18: Final verification

- [ ] **Step 1: Confirm call-site count**

Run:

```bash
rg "notify\.emit\(" --count-matches
```

Expected: at least 6 call sites (mail-sent, mail-failed, mail-blocked, import-complete, import-failed, mutation-error, system-remote-notification). Exact count depends on how each file was refactored.

- [ ] **Step 2: Confirm no stragglers**

Run:

```bash
rg "showToast|useNotify" -g '!docs/**'
```

Expected: no matches outside of the spec/plan docs.

- [ ] **Step 3: Run the full suite one more time**

Run: `bun run checks && bun run test:unit`
Expected: PASS.

- [ ] **Step 4: Manual smoke in dev server (optional but recommended)**

Run: `bun run dev`

In the browser:
1. Trigger a mail send failure (disconnect network, click send) → error toast appears.
2. Trigger a Google Takeout import → success notification lands in the bell drawer AND a toast appears.
3. Open a form, force a validation error → inline field error appears (FormErrorSummary unchanged).
4. Open a form, force a non-field server error → error toast appears.

Report any drift from expected behavior before opening the PR.

**End of Commit 3.** Unification complete.

---

## Out-of-scope reminders

Do not implement in this plan — these are future work:

- Per-user channel preferences (a `user_notification_prefs` PB table + settings UI).
- Web Push channel using `push_subscriptions`.
- Email-as-channel routing through the mail package.
- Calendar reminders (still owned by `scheduleNotification` in `lib/notifications.ts`).
- Replacing `FormErrorSummary` (field-level errors stay inline).

If you find yourself wanting to add one of these during implementation, stop and update the spec first.
