# Unified Notifications Design

> **⚠️ Historical / superseded.** Frozen design doc from April 2026. The narrative below references Bun as the project package manager — the project has since migrated to pnpm. Kept for historical context.

**Status:** Draft
**Date:** 2026-04-18
**Author:** Nathan Stitt (with Claude)

## Problem

TinyCld has five overlapping user-facing messaging mechanisms, each chosen ad-hoc by different features:

1. **Toasts** — `lib/toast.ts` (`showToast`), backed by `lib/stores/toast-store.ts`, rendered by `components/Toast.tsx`. ~9 call sites.
2. **In-app notification center** — `useNotify()` in `lib/use-notify.ts` inserts into the `notifications` PB collection *and* fires a toast. `NotificationBell` + `NotificationDrawer` render the feed. ~14 call sites.
3. **OS notifications** — `lib/notifications.ts` exposes immediate `notify()` (browser Notification API + `expo-notifications`) and `scheduleNotification()`. Used only by calendar reminders today.
4. **Form errors** — `FormErrorSummary` renders inline field errors from React Hook Form.
5. **Error capture** — `captureException()` logs to Sentry; not user-facing on its own.

Concrete problems this causes:

- **Developer confusion:** no rule says when a feature should toast vs. bell vs. both. Choice is per-file, drifts over time.
- **UX inconsistency:** `useNotify` always both inserts and toasts, `showToast` only toasts, nothing says when OS push is appropriate. Similar events surface differently across packages.
- **Duplicated content:** `useNotify`'s dual write means every persistent notification also emits a toast — not always what we want (e.g., import progress checkpoints).
- **Missing coverage:** non-field mutation errors are swallowed by forms; there's no uniform path for "something went wrong."
- **Fragmented ownership:** changing notification policy ("stop toasting on email send, it's noisy") requires touching every call site.

## Goals

- One API every feature calls to notify the user of something.
- Channel routing (toast / in-app center / OS) is decided centrally, by event type.
- Type-safe: event names and payloads are checked at compile time.
- Content (title, body, url) stays at the call site, near the data.
- Migrating `showToast` and `useNotify` call sites is mechanical — no behavior change intended in v1.
- Future channels (Web Push, email, in-app banner) can be added without refactoring.

## Non-goals (v1)

- Per-user channel preferences — designed so they can slot in later, not built now.
- Web Push subscriptions — `push_subscriptions` collection exists but stays unwired.
- Email-as-channel — routing events through the mail package.
- Calendar reminders — scheduled OS notifications with cancel-by-identifier semantics have a different lifecycle; they remain on `lib/notifications.ts::scheduleNotification()` untouched.
- Replacing `FormErrorSummary` — inline field-level errors stay where they are. Only non-field mutation errors route through the unified API.

## Design decisions (from brainstorming)

- **Mental model: event-first.** Call sites emit events; a registry decides channels. Rejected alternatives: channel-first (each call site picks channel — keeps fragmentation) and severity-based routing (severity is too lossy to map to channels reliably).
- **Content placement: call-site inline.** Call sites pass `title`/`body`/`url` in the emit payload; registry controls only channels and variant. Rejected alternatives: pure event emission with registry templates (adds a templating layer we don't need) and per-call channel override (if the call site knows better than the policy, the policy is wrong).
- **Registry shape: typed event map + config object.** Single TS type `NotificationEvents` for payloads, single `eventRegistry` object for policy. Rejected alternatives: class-per-event (too heavy for ~20 events) and declarative JSON/YAML (no non-dev editors).
- **No user preferences yet.** v1 is dev-defined. Preferences land later as a layer over the registry.

## Architecture

```
Call site                            Router                           Channels
─────────                            ──────                           ────────

useSendEmail ──┐
               │    notify.emit({                 ┌──► ToastChannel ──► toast-store (Zustand)
useImport ─────┤    event: 'mail.sent',           │                        │
               │    title, body, url, data        │                        ▼
settings ──────┼──► })                             │                   components/Toast.tsx
               │              │                    │
mutations ─────┤              ▼                    ├──► BellChannel ───► notifications PB
               │       ┌──────────────┐            │                        │
any feature ───┘       │ eventRegistry │ ─(rules)──┤                        ▼
                       │              │            │                   NotificationBell +
                       │ 'mail.sent': │            │                   NotificationDrawer
                       │   [toast]    │            │
                       │ 'import.     │            └──► OsChannel ────► expo-notifications /
                       │  complete':  │                  (perm-gated)    browser Notification
                       │   [toast,    │
                       │    bell,     │            (future) WebPushChannel, EmailChannel
                       │    os]       │
                       └──────────────┘
```

Key properties:

- Single entry point: `notify.emit(payload)` from `~/lib/notify`.
- Typed events: `NotificationEvents` type map catches typos and missing payload data at compile time.
- Centralized policy: one `eventRegistry` file decides which channels fire per event.
- Channel interface: each channel implements `dispatch(input)`; adding a channel is one file + one config entry.

## Public API

```ts
import { notify } from '~/lib/notify'

notify.emit({
    event: 'mail.sent',
    title: 'Message sent',
    body: `To ${to}`,
    url: orgHref('mail', { folder: 'sent' }),
    data: { messageId }, // optional; stored with persistent records
})
```

`notify` is a module-level object (not a hook). `emit()` returns `void` — dispatch is fire-and-forget with per-channel error isolation.

### Event type map

```ts
// lib/notify/events.ts
export type NotificationEvents = {
    'mail.sent':         { messageId: string }
    'mail.send_failed':  { error: string; retryable: boolean }
    'import.complete':   { source: 'google-takeout' | 'csv'; count: number }
    'import.failed':     { source: string; error: string }
    'mutation.error':    { operation: string; error: string }
    // ... one entry per discrete event
}

export type NotifyEventName = keyof NotificationEvents
```

### Event registry

```ts
// lib/notify/registry.ts
type ChannelName = 'toast' | 'bell' | 'os'
type Variant = 'info' | 'success' | 'warning' | 'error'

export type EventConfig = {
    channels: ChannelName[]
    variant: Variant
}

export const eventRegistry: Record<NotifyEventName, EventConfig> = {
    'mail.sent':         { channels: ['toast'],               variant: 'success' },
    'mail.send_failed':  { channels: ['toast'],               variant: 'error'   },
    'import.complete':   { channels: ['toast', 'bell', 'os'], variant: 'success' },
    'import.failed':     { channels: ['toast', 'bell'],       variant: 'error'   },
    'mutation.error':    { channels: ['toast'],               variant: 'error'   },
    // ... one entry per event in NotificationEvents
}
```

The type system requires `eventRegistry` to have a key for every `NotifyEventName`; missing entries fail at compile time.

### Emit input

```ts
export type NotifyInput<K extends NotifyEventName = NotifyEventName> = {
    event: K
    title: string
    body?: string
    url?: string
    data?: NotificationEvents[K]
}
```

### Channel interface

```ts
// lib/notify/channels/types.ts
export type DispatchInput = NotifyInput & { variant: Variant }

export interface NotifyChannel {
    name: ChannelName
    dispatch(input: DispatchInput): void | Promise<void>
}
```

## Components

### `lib/notify/dispatcher.ts`

Implements `notify.emit`:

```ts
function emit<K extends NotifyEventName>(input: NotifyInput<K>): void {
    const config = eventRegistry[input.event]
    if (!config) {
        captureException(new Error(`unknown notification event: ${input.event}`))
        return
    }

    const dispatchInput: DispatchInput = { ...input, variant: config.variant }

    for (const channelName of config.channels) {
        const channel = channels[channelName]
        try {
            const result = channel.dispatch(dispatchInput)
            if (result instanceof Promise) result.catch((e) => captureException(e))
        } catch (e) {
            captureException(e)
        }
    }
}

export const notify = { emit }
```

### `lib/notify/channels/toast.ts`

Wraps the existing `toast-store`. Maps `variant` directly to the existing toast variant. Synchronous.

### `lib/notify/channels/bell.ts`

Inserts a row into the `notifications` PB collection using the pbtsdb `notificationsCollection`. Reads org + user context from `getNotifyContext()` (see below). If context is missing, logs a dev-only warning and no-ops — never throws. Returns a Promise.

### `lib/notify/channels/os.ts`

Calls the existing platform-agnostic immediate-notify helper in `lib/notifications.ts` (extracted from the current `notify` function). Checks permission first; if not granted, no-ops silently (permission request is the caller's responsibility via `requestNotificationPermission()` elsewhere in the app).

### `lib/notify/context.ts`

Holds a module-level snapshot of org/user context so non-hook code can access it:

```ts
type NotifyContext = { orgId: string; userOrgId: string; userId: string } | null

let current: NotifyContext = null

export function setNotifyContext(ctx: NotifyContext) { current = ctx }
export function getNotifyContext(): NotifyContext { return current }
```

### `components/NotifyContextSync.tsx` (new, inside `app/a/[orgSlug]/_layout.tsx`)

A zero-render component that reads `useOrgInfo()` + `useCurrentUserOrg()` + current user id and calls `setNotifyContext()` on change. Mounted once per org layout. When the user logs out or switches orgs, context is re-synced.

### Updates to existing files

- `lib/errors.ts` — `handleMutationErrorsWithForm` gains a branch: when the error has no field-level details, emit `notify.emit({ event: 'mutation.error', title: 'Something went wrong', body: errorToString(err), data: { operation, error: errorToString(err) } })` instead of silently swallowing. The caller passes an `operation` label (e.g., `'create contact'`) for telemetry.
- `app/a/[orgSlug]/_layout.tsx` — mounts `<NotifyContextSync />`.

### Files kept unchanged

- `lib/stores/toast-store.ts`
- `components/Toast.tsx` (renderer)
- `components/NotificationBell.tsx`, `components/NotificationDrawer.tsx`
- `notifications` PB collection schema
- `lib/notifications.ts::scheduleNotification` (calendar)
- `lib/notifications.ts::requestNotificationPermission`
- `FormErrorSummary` (out of scope)

### Files removed (commit 3)

- `lib/toast.ts` — `showToast` helper
- `lib/use-notify.ts` — `useNotify` hook
- `components/NotificationListener.tsx` — *if* its only role is firing a toast on `notifications` collection inserts (redundant once BellChannel is the sole insertion path via our app). If it also drives realtime sync across other clients, keep it.

## Data flow examples

**Mail send success** (single-channel toast):

```ts
notify.emit({
    event: 'mail.sent',
    title: 'Message sent',
    body: `To ${recipient}`,
    data: { messageId },
})
```

Registry routes to `['toast']` with variant `success`. ToastChannel inserts into `toast-store`; `<ToastRenderer>` animates it in.

**Import complete** (multi-channel: toast + bell + OS):

```ts
notify.emit({
    event: 'import.complete',
    title: 'Import complete',
    body: `${count} contacts imported from Google Takeout`,
    url: orgHref('contacts'),
    data: { source: 'google-takeout', count },
})
```

Registry routes to `['toast', 'bell', 'os']` with variant `success`.
- ToastChannel fires immediately.
- BellChannel reads context, inserts into `notifications` PB with `{ user, org, type: 'import.complete', title, body, url, metadata: data }`. NotificationBell re-renders with +1 unread.
- OsChannel checks permission; if granted, fires browser/expo Notification.

**Mutation error** (toast):

Non-field errors in `handleMutationErrorsWithForm` call:

```ts
notify.emit({
    event: 'mutation.error',
    title: 'Something went wrong',
    body: errorToString(err),
    data: { operation, error: errorToString(err) },
})
```

## Error handling

- **Unknown event name:** `captureException(new Error('unknown notification event: ...'))`, dispatch returns early. Callers don't throw.
- **Channel dispatch throws (sync):** caught by dispatcher, `captureException`, loop continues to next channel.
- **Channel dispatch rejects (async):** `.catch(captureException)`, other channels unaffected.
- **Missing context for BellChannel:** dev-only `console.warn`, no-op. Production: silent no-op (still logged via `log.warn` in `lib/logger.ts` for Sentry breadcrumbs).
- **OS permission missing:** OsChannel silent no-op. Not an error condition.

No retries. Notifications are best-effort UX; failed dispatch is not worth user-visible errors.

## Testing

Unit tests in `lib/notify/__tests__/` using the project's existing test infra (no mocking our own components per CONTRIBUTING.md).

1. **`dispatcher.test.ts`**
   - Known event → channel `dispatch` called with correct input (channels mocked via test doubles in the channels registry)
   - Unknown event → `captureException` called, no throw
   - One channel throws → other channels still dispatched
   - One channel rejects → other channels unaffected, `captureException` called
   - `variant` from registry merged into dispatch input

2. **`channels/toast.test.ts`**
   - Dispatch inserts into real `toast-store`; snapshot store state
   - Variant maps to correct toast variant

3. **`channels/bell.test.ts`**
   - Dispatch calls `notificationsCollection.insert` with resolved context fields
   - Missing context → no insert, warning logged, no throw
   - Insert failure → `captureException`, no throw

4. **`channels/os.test.ts`**
   - Permission granted → platform notify called
   - Permission not granted → no call, no throw

5. **`notify-integration.test.tsx`** — end-to-end
   - Render a tiny component that emits `mail.sent`
   - Assert toast appears in the DOM via real `ToastChannel` + real `toast-store` + real `ToastRenderer`

Existing tests in `packages/mail` that assert on `showToast` calls are updated to assert on the visible toast (or the new `notify.emit` path where DOM assertions aren't practical).

## Rollout plan

Three commits, each independently shippable and reviewable:

### Commit 1: Infrastructure

- Add `lib/notify/` (dispatcher, events, registry, channels, context)
- Add `NotifyContextSync` to `app/a/[orgSlug]/_layout.tsx`
- Full unit + integration tests
- No call-site changes — `showToast` and `useNotify` still work
- Passes `pnpm run checks` + `pnpm run test:unit`

### Commit 2: Migrate call sites

- Replace 9 `showToast` call sites with `notify.emit()`
- Replace 14 `useNotify` call sites with `notify.emit()`
- Add each event to `NotificationEvents` + `eventRegistry` as call sites are migrated
- Update `handleMutationErrorsWithForm` to emit `mutation.error`
- Update existing tests that asserted on `showToast` / `useNotify`
- Ripgrep verifies no remaining imports of `showToast` or `useNotify`

### Commit 3: Remove deprecated APIs

- Delete `lib/toast.ts`, `lib/use-notify.ts`
- Evaluate `components/NotificationListener.tsx` — delete if redundant; keep with a comment if it drives realtime cross-client sync
- TypeScript build confirms no stragglers

## Future extensions

Designed into the shape; not built now:

- **User preferences** — a `user_notification_prefs` PB table keyed by `(user, event)` overrides `eventRegistry.channels` at dispatch time. Settings UI under `settings/notifications`.
- **Web Push channel** — `WebPushChannel` calls a Go hook that uses existing `push_subscriptions` rows. One new file in `channels/`, one registry entry.
- **Email channel** — `EmailChannel` routes to the mail package's transactional send. One new file, one registry entry. Useful for digest-style events.
- **Escalation rules** — registry entries could gain `if: 'tab_hidden'` or `throttle: '5m'` conditions. Dispatcher reads these before calling each channel.

## Open questions

- `NotificationListener.tsx` behavior: is it a local toast-on-insert convenience, or does it sync realtime notifications from the server? Verify during commit 3.
- `mutation.error` body content — `errorToString()` output can be verbose. A future refinement might truncate or summarize, but v1 keeps it raw for debuggability.
