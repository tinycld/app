import type { ReactNode } from 'react'
import { useState } from 'react'
import { Platform, View } from 'react-native'
import { Menu } from '@tinycld/core/ui/menu'

interface ContextMenuProps {
    children: ReactNode
    /**
     * Menu items shown when the user opens the context menu. Accepts a
     * function so callers can avoid building the JSX tree until the menu
     * is actually opened — important when many ContextMenu wrappers are
     * mounted at once (e.g. one per drive list row).
     */
    content: ReactNode | (() => ReactNode)
}

// Lazy-mount the Menu tree (Provider, Trigger, Portal, Overlay, Content)
// only after the user first opens the menu. A populated list view renders
// dozens of these wrappers per screen and most are never opened; mounting
// the full Menu eagerly was the bulk of the per-row mount cost.
export function ContextMenu({ children, content }: ContextMenuProps) {
    const [opened, setOpened] = useState<{ x: number; y: number } | null>(null)

    if (!opened) {
        if (Platform.OS !== 'web') {
            // Native long-press is wired by the Menu trigger; bypass the lazy
            // path so the press handler is registered from mount.
            return <ContextMenuActive content={content}>{children}</ContextMenuActive>
        }
        return (
            <View
                // biome-ignore lint/suspicious/noExplicitAny: web-only DOM event prop on RN View
                {...({
                    onContextMenu: (e: { preventDefault: () => void; clientX: number; clientY: number }) => {
                        e.preventDefault()
                        setOpened({ x: e.clientX, y: e.clientY })
                    },
                } as any)}
            >
                {children}
            </View>
        )
    }

    return (
        <ContextMenuActive content={content} initialPos={opened} onClose={() => setOpened(null)}>
            {children}
        </ContextMenuActive>
    )
}

function ContextMenuActive({
    children,
    content,
    initialPos,
    onClose,
}: ContextMenuProps & {
    initialPos?: { x: number; y: number }
    onClose?: () => void
}) {
    const [isOpen, setIsOpen] = useState(!!initialPos)
    const [cursorPos, setCursorPos] = useState<{
        x: number
        y: number
        width: number
        height: number
    } | null>(initialPos ? { ...initialPos, width: 0, height: 0 } : null)

    const webProps =
        Platform.OS === 'web'
            ? {
                  onContextMenu: (e: React.MouseEvent) => {
                      e.preventDefault()
                      setCursorPos({ x: e.clientX, y: e.clientY, width: 0, height: 0 })
                      setIsOpen(true)
                  },
              }
            : {}

    const handleOpenChange = (next: boolean) => {
        setIsOpen(next)
        if (!next) onClose?.()
    }

    const renderedContent = typeof content === 'function' ? content() : content

    return (
        <Menu isOpen={isOpen} onOpenChange={handleOpenChange} triggerPosition={cursorPos}>
            <Menu.Trigger disableClick>
                <View {...webProps}>{children}</View>
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Overlay />
                <Menu.Content presentation="popover" placement="bottom" align="start">
                    {renderedContent}
                </Menu.Content>
            </Menu.Portal>
        </Menu>
    )
}
