import type { ReactNode } from 'react'
import { useState } from 'react'
import { Platform, View } from 'react-native'
import { Menu } from '@tinycld/core/ui/menu'

interface ContextMenuProps {
    children: ReactNode
    content: ReactNode
}

export function ContextMenu({ children, content }: ContextMenuProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [cursorPos, setCursorPos] = useState<{
        x: number
        y: number
        width: number
        height: number
    } | null>(null)

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

    return (
        <Menu isOpen={isOpen} onOpenChange={setIsOpen} triggerPosition={cursorPos}>
            <Menu.Trigger disableClick>
                <View {...webProps}>{children}</View>
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Overlay />
                <Menu.Content presentation="popover" placement="bottom" align="start">
                    {content}
                </Menu.Content>
            </Menu.Portal>
        </Menu>
    )
}
