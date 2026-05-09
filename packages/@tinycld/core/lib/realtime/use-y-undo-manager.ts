import { useEffect } from 'react'
import * as Y from 'yjs'
import { LOCAL_ORIGIN } from './client'

export interface UseYUndoManagerOptions {
    // The set of Y types to scope undo to. Most callers pass the
    // top-level Y.Maps that hold their app's mutable state — e.g.
    // sheets passes [doc.getMap('cells'), doc.getMap('sheets')].
    //
    // The `AbstractType<any>` typing matches Y.UndoManager's own
    // constructor signature in upstream yjs — it's the only correct
    // shape for "any Y type subclass."
    // biome-ignore lint/suspicious/noExplicitAny: matches Y.UndoManager's upstream constructor signature.
    scope: () => Y.AbstractType<any>[]

    // captureTimeout groups successive edits made within this many
    // milliseconds into one undo step. Default 500 — typing a cell
    // value isn't separate undo steps per keystroke.
    captureTimeoutMs?: number
}

// useYUndoManager wires Cmd-Z / Cmd-Shift-Z (and Cmd-Y) to a
// Y.UndoManager scoped over the supplied Y types. The UndoManager
// only captures LOCAL_ORIGIN updates from the realtime client layer's
// sentinel — REMOTE_ORIGIN and SYNC_ORIGIN updates are excluded so
// undoing my edits never reverts a peer's edits, and the initial
// sync state transfer doesn't show up as a single giant undo step.
//
// Consumers must wrap their own writes in `doc.transact(fn,
// LOCAL_ORIGIN)` for the captures to work; see use-y-cell.ts in
// sheets for the canonical pattern.
//
// Web only: keyboard listeners attach to window. On native we'd want
// either a hardware-keyboard listener or an in-app toolbar.
export function useYUndoManager(doc: Y.Doc | null, options: UseYUndoManagerOptions): void {
    const { scope, captureTimeoutMs = 500 } = options

    useEffect(() => {
        if (doc == null) return
        if (typeof window === 'undefined') return

        const targets = scope()
        if (targets.length === 0) return

        const manager = new Y.UndoManager(targets, {
            captureTimeout: captureTimeoutMs,
            // Allowlist: only LOCAL_ORIGIN updates produce undo
            // entries. Anything else (REMOTE_ORIGIN, SYNC_ORIGIN, or
            // any unknown origin some other library introduces) is
            // excluded by virtue of not being in the set.
            trackedOrigins: new Set<unknown>([LOCAL_ORIGIN]),
        })

        const onKey = (e: KeyboardEvent) => {
            const meta = e.metaKey || e.ctrlKey
            if (!meta) return
            if (e.key === 'z' && !e.shiftKey) {
                e.preventDefault()
                manager.undo()
            } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
                e.preventDefault()
                manager.redo()
            }
        }

        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('keydown', onKey)
            manager.destroy()
        }
        // biome-ignore lint/correctness/useExhaustiveDependencies: scope is intentionally captured by closure on first mount; remounting on every render would tear down and recreate the UndoManager (and its undo stack) constantly.
    }, [doc, captureTimeoutMs])
}
