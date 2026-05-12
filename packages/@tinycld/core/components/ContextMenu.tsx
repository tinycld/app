import { Menu } from '@tinycld/core/ui/menu'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'

interface ContextMenuProps {
    children: ReactNode
    /**
     * Menu items shown when the user opens the context menu. Accepts a
     * function so callers can avoid building the JSX tree until the menu
     * is actually opened — important when many ContextMenu wrappers are
     * mounted at once (e.g. one per drive list row).
     */
    content: ReactNode | (() => ReactNode)
    /**
     * Fires when the menu is about to open. Use to mirror the right-click
     * into selection state (e.g. `selectItem(id)`) so the highlighted
     * row matches the menu target. May return a cleanup function; if
     * provided, the cleanup runs when the menu is dismissed *without* the
     * user picking an item (outside-click, escape) — useful to roll back
     * a transient selection. The cleanup is NOT called when a menu item is
     * pressed, because the item's action already implies the user
     * intended the selection.
     */
    onOpen?: () => undefined | (() => void)
}

// Lazy-mount the Menu apparatus (Provider, Portal, Overlay, Content) only
// after the user first opens the menu. A populated list view renders
// dozens of these wrappers per screen and most are never opened; mounting
// the full Menu eagerly was the bulk of the per-row mount cost.
//
// Critically, the wrapper element that hosts {children} stays mounted
// across the closed→open transition — the lazy Menu mounts as a sibling
// rather than as a parent. Reparenting children when the menu opens would
// remount the row's subtree (resetting hover state, re-decoding thumbnails,
// retriggering CSS transitions), which shows up as a visible flicker.
export function ContextMenu({ children, content, onOpen }: ContextMenuProps) {
    if (Platform.OS !== 'web') {
        // Native long-press is wired by Menu.Trigger; that path needs the
        // Menu mounted from the start so the press handler is registered.
        return (
            <ContextMenuNative content={content} onOpen={onOpen}>
                {children}
            </ContextMenuNative>
        )
    }
    return (
        <ContextMenuWeb content={content} onOpen={onOpen}>
            {children}
        </ContextMenuWeb>
    )
}

function ContextMenuWeb({ children, content, onOpen }: ContextMenuProps) {
    const [cursorPos, setCursorPos] = useState<{
        x: number
        y: number
        width: number
        height: number
    } | null>(null)

    const onOpenRef = useRef(onOpen)
    onOpenRef.current = onOpen
    // Cleanup returned by onOpen(). Run on outside-click dismissal so the
    // caller can revert any transient state set up at open time. Cleared
    // on item press so the action commits.
    const cleanupRef = useRef<(() => void) | undefined>(undefined)

    const handleContextMenu = useCallback(
        (e: { preventDefault: () => void; clientX: number; clientY: number }) => {
            e.preventDefault()
            setCursorPos({ x: e.clientX, y: e.clientY, width: 0, height: 0 })
            const cleanup = onOpenRef.current?.()
            cleanupRef.current = typeof cleanup === 'function' ? cleanup : undefined
        },
        []
    )

    const handleDismissed = useCallback(() => {
        cleanupRef.current?.()
        cleanupRef.current = undefined
        setCursorPos(null)
    }, [])

    const handleActioned = useCallback(() => {
        cleanupRef.current = undefined
        setCursorPos(null)
    }, [])

    // The Menu apparatus stays unmounted entirely while the menu is closed.
    // Mounting it persistently between opens is tempting (slightly faster
    // re-open) but Gluestack's overlay initialises its `exited` state once
    // on mount from `!isOpen`; without an ExitAnimationContext consumer in
    // our tree, `exited` never resets, so a closed-then-reopened overlay
    // never gets its `display: none` cleared. Tearing the tree down on
    // close keeps that state machine in its expected mount-once shape.
    return (
        <View
            // biome-ignore lint/suspicious/noExplicitAny: web-only DOM event prop on RN View
            {...({ onContextMenu: handleContextMenu } as any)}
        >
            {children}
            {cursorPos && (
                <LazyMenuOverlay
                    content={content}
                    onDismissed={handleDismissed}
                    onActioned={handleActioned}
                    cursorPos={cursorPos}
                />
            )}
        </View>
    )
}

interface LazyMenuOverlayProps {
    content: ReactNode | (() => ReactNode)
    /** Closed without picking an item (outside-click, escape). */
    onDismissed: () => void
    /** Closed because the user pressed an item — the action is happening. */
    onActioned: () => void
    cursorPos: { x: number; y: number; width: number; height: number }
}

// Renders the Menu apparatus as a sibling of {children}. Menu.Content
// portals through Gluestack's overlay so it positions absolutely from
// cursorPos; no Trigger element is needed in this tree.
//
// `LazyMenuOverlay` is only mounted while the menu is open — closing
// unmounts the entire subtree. Outside-click dismissal goes through a
// document-level pointerdown listener (see useCloseMenuOnOutsideClick)
// rather than an absolute-fill Pressable; the Pressable approach is
// unreliable inside Gluestack's overlay container because depending on
// stacking and pointer-events, clicks can land on the row underneath
// instead of the dismiss layer.
function LazyMenuOverlay({ content, onDismissed, onActioned, cursorPos }: LazyMenuOverlayProps) {
    const contentRef = useRef<View | null>(null)
    useCloseMenuOnOutsideClick({ onClose: onDismissed, contentRef })

    // Menu.Item internally calls onOpenChange(false) after press — that's the
    // "actioned" path. We don't get the same signal from outside-click
    // because that path closes via our custom pointerdown listener which
    // calls onDismissed directly without going through Menu's onOpenChange.
    const handleOpenChange = useCallback(
        (open: boolean) => {
            if (!open) onActioned()
        },
        [onActioned]
    )

    const renderedContent = typeof content === 'function' ? content() : content

    return (
        <Menu isOpen={true} onOpenChange={handleOpenChange} triggerPosition={cursorPos}>
            <Menu.Portal>
                <Menu.Content
                    ref={contentRef}
                    presentation="popover"
                    placement="bottom"
                    align="start"
                >
                    {renderedContent}
                </Menu.Content>
            </Menu.Portal>
        </Menu>
    )
}

// Close the menu on any pointerdown that lands outside Menu.Content.
// Listens at the document in the capture phase so the menu disappears
// before the click triggers any underlying handler. Right-clicks outside
// also close — that lets the new row's onContextMenu open a fresh menu
// in the same gesture.
function useCloseMenuOnOutsideClick(params: {
    onClose: () => void
    contentRef: React.MutableRefObject<View | null>
}) {
    const { onClose, contentRef } = params
    const onCloseRef = useRef(onClose)
    onCloseRef.current = onClose

    useEffect(() => {
        if (typeof document === 'undefined') return
        const handler = (event: PointerEvent) => {
            const target = event.target as Node | null
            const node = contentRef.current as unknown as Node | null
            if (target && node?.contains(target)) return
            onCloseRef.current()
        }
        document.addEventListener('pointerdown', handler, true)
        return () => {
            document.removeEventListener('pointerdown', handler, true)
        }
    }, [contentRef])
}

// Native path: Menu.Trigger wraps {children} from mount so long-press
// is registered immediately. There's no equivalent flicker concern here
// because the Trigger is mounted from the start — no reparenting on open.
// Native uses a Pressable absolute-fill scrim (no document on native).
function ContextMenuNative({ children, content, onOpen }: ContextMenuProps) {
    const [isOpen, setIsOpen] = useState(false)
    const renderedContent = typeof content === 'function' ? content() : content

    const onOpenRef = useRef(onOpen)
    onOpenRef.current = onOpen
    const cleanupRef = useRef<(() => void) | undefined>(undefined)

    const handleOpenChange = useCallback((next: boolean) => {
        setIsOpen(next)
        if (next) {
            const cleanup = onOpenRef.current?.()
            cleanupRef.current = typeof cleanup === 'function' ? cleanup : undefined
        } else {
            // Menu.Item triggers this path — actioned, not dismissed.
            cleanupRef.current = undefined
        }
    }, [])

    const handleScrimPress = useCallback(() => {
        cleanupRef.current?.()
        cleanupRef.current = undefined
        setIsOpen(false)
    }, [])

    return (
        <Menu isOpen={isOpen} onOpenChange={handleOpenChange}>
            <Menu.Trigger disableClick>
                <View>{children}</View>
            </Menu.Trigger>
            <Menu.Portal>
                <Pressable style={StyleSheet.absoluteFill} onPress={handleScrimPress} />
                <Menu.Content presentation="popover" placement="bottom" align="start">
                    {renderedContent}
                </Menu.Content>
            </Menu.Portal>
        </Menu>
    )
}
