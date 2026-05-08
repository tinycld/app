import { Overlay as GluestackOverlay } from '@gluestack-ui/core/overlay/creator'
import React, { createContext, forwardRef, useCallback, useContext, useRef, useState } from 'react'
import { Dimensions, Platform, Pressable, Text, View } from 'react-native'

interface MenuContextValue {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    triggerRef: React.RefObject<View | null>
    triggerLayout: { x: number; y: number; width: number; height: number } | null
    setTriggerLayout: (
        layout: {
            x: number
            y: number
            width: number
            height: number
        } | null
    ) => void
}

const MenuContext = createContext<MenuContextValue | null>(null)

function useMenuContext() {
    const ctx = useContext(MenuContext)
    if (!ctx) throw new Error('Menu compound components must be used within <Menu>')
    return ctx
}

// ── Root ──

interface MenuProps {
    children: React.ReactNode
    isOpen?: boolean
    onOpenChange?: (open: boolean) => void
    /** Override trigger position (useful for context menus positioned at cursor) */
    triggerPosition?: { x: number; y: number; width: number; height: number } | null
}

function MenuRoot({
    children,
    isOpen: controlledOpen,
    onOpenChange: controlledOnChange,
    triggerPosition,
}: MenuProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const isOpen = controlledOpen ?? internalOpen
    const onOpenChange = controlledOnChange ?? setInternalOpen
    const triggerRef = useRef<View | null>(null)
    const [internalLayout, setInternalLayout] = useState<{
        x: number
        y: number
        width: number
        height: number
    } | null>(null)

    const triggerLayout = triggerPosition ?? internalLayout

    return (
        <MenuContext.Provider
            value={{
                isOpen,
                onOpenChange,
                triggerRef,
                triggerLayout,
                setTriggerLayout: setInternalLayout,
            }}
        >
            <View>{children}</View>
        </MenuContext.Provider>
    )
}

// ── Trigger ──

interface TriggerProps {
    children: React.ReactElement
    /** When true, the trigger won't open the menu on click (useful for context menus that open via onContextMenu) */
    disableClick?: boolean
}

function Trigger({ children, disableClick }: TriggerProps) {
    const { onOpenChange, isOpen, triggerRef, setTriggerLayout } = useMenuContext()
    const isOpenRef = useRef(isOpen)
    isOpenRef.current = isOpen

    // biome-ignore lint/suspicious/noExplicitAny: web-only ref for DOM element
    const webDivRef = useRef<any>(null)

    const handleClick = useCallback(() => {
        if (disableClick) return
        if (Platform.OS === 'web' && webDivRef.current) {
            const rect = webDivRef.current.getBoundingClientRect()
            setTriggerLayout({
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
            })
            onOpenChange(!isOpenRef.current)
        } else if (triggerRef.current) {
            triggerRef.current.measureInWindow((x, y, width, height) => {
                setTriggerLayout({ x, y, width, height })
                onOpenChange(!isOpenRef.current)
            })
        } else {
            onOpenChange(!isOpenRef.current)
        }
    }, [disableClick, onOpenChange, setTriggerLayout, triggerRef])

    if (Platform.OS === 'web') {
        return (
            <div
                ref={node => {
                    webDivRef.current = node
                    ;(triggerRef as React.MutableRefObject<View | null>).current =
                        node as unknown as View
                }}
                onClickCapture={handleClick}
            >
                {children}
            </div>
        )
    }

    // Wrapping a Pressable child in another Pressable swallows touches on native — the inner responder wins. Clone the child to inject onPress + ref.
    type PressableChildProps = {
        onPress?: (e: unknown) => void
        ref?: React.Ref<View>
    }
    const child = children as React.ReactElement<PressableChildProps>
    const childOnPress = child.props.onPress
    const composedOnPress = (e: unknown) => {
        childOnPress?.(e)
        handleClick()
    }
    return React.cloneElement(child, {
        ref: triggerRef as React.Ref<View>,
        onPress: composedOnPress,
    })
}

// ── Portal ──

function Portal({ children }: { children: React.ReactNode }) {
    const ctx = useMenuContext()

    return (
        <GluestackOverlay
            isOpen={ctx.isOpen}
            isKeyboardDismissable
            onRequestClose={() => ctx.onOpenChange(false)}
        >
            <MenuContext.Provider value={ctx}>{children}</MenuContext.Provider>
        </GluestackOverlay>
    )
}

// ── Overlay ──

const Overlay = forwardRef<View, { onPress?: () => void }>(function Overlay(_props, _ref) {
    const { onOpenChange } = useMenuContext()
    return (
        <Pressable
            onPress={() => onOpenChange(false)}
            className="absolute top-0 left-0 right-0 bottom-0"
        />
    )
})

// ── Content ──

interface ContentProps {
    children: React.ReactNode
    presentation?: 'popover' | 'bottom-sheet'
    placement?: 'top' | 'bottom' | 'left' | 'right'
    align?: 'start' | 'center' | 'end'
    className?: string
    style?: object
}

const Content = forwardRef<View, ContentProps>(function Content(
    { children, placement = 'bottom', align = 'start', className, style: styleProp },
    ref
) {
    const { triggerLayout } = useMenuContext()
    const [contentSize, setContentSize] = useState<{ width: number; height: number } | null>(null)
    const windowDim = Dimensions.get('window')

    const positionStyle = React.useMemo(() => {
        if (!triggerLayout) return {}

        const pos: Record<string, number | string> = {}
        const gap = 4

        // Horizontal alignment
        if (placement === 'bottom' || placement === 'top') {
            if (align === 'start') pos.left = triggerLayout.x
            else if (align === 'end')
                pos.left = triggerLayout.x + triggerLayout.width - (contentSize?.width ?? 200)
            else
                pos.left = triggerLayout.x + triggerLayout.width / 2 - (contentSize?.width ?? 0) / 2
        }

        // Vertical placement
        if (placement === 'top') {
            if (contentSize) {
                pos.top = triggerLayout.y - contentSize.height - gap
            } else {
                pos.top = -9999
            }
        } else {
            pos.top = triggerLayout.y + triggerLayout.height + gap
        }

        // Clamp horizontal
        if (contentSize) {
            if (typeof pos.left === 'number' && pos.left + contentSize.width > windowDim.width - 8)
                pos.left = windowDim.width - contentSize.width - 8
            if (typeof pos.left === 'number' && pos.left < 8) pos.left = 8
        }

        // Flip vertical if overflowing
        if (contentSize && typeof pos.top === 'number') {
            if (pos.top + contentSize.height > windowDim.height - 8) {
                pos.top = triggerLayout.y - contentSize.height - gap
            }
            if (pos.top < 8) {
                pos.top = triggerLayout.y + triggerLayout.height + gap
            }
        }

        return pos
    }, [triggerLayout, placement, align, contentSize, windowDim])

    return (
        <View
            ref={ref}
            onLayout={e => {
                const { width, height } = e.nativeEvent.layout
                setContentSize(prev =>
                    prev?.width === width && prev?.height === height ? prev : { width, height }
                )
            }}
            className={`absolute min-w-[200px] border border-border bg-background rounded-lg py-1 ${className ?? ''}`}
            style={[
                Platform.OS === 'web'
                    ? ({ boxShadow: '0 4px 16px rgba(0,0,0,0.15)' } as object)
                    : {
                          elevation: 8,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.15,
                          shadowRadius: 12,
                      },
                positionStyle,
                styleProp,
            ]}
        >
            {children}
        </View>
    )
})

// ── Item ──

interface ItemProps {
    children: React.ReactNode
    onPress?: (e?: unknown) => void
    href?: string
    isDisabled?: boolean
    className?: string
    style?: object
}

const Item = forwardRef<View, ItemProps>(function Item(
    { children, onPress: onPressProp, href, isDisabled, className, style: styleProp },
    ref
) {
    const { onOpenChange } = useMenuContext()
    const [hovered, setHovered] = useState(false)

    const handlePress = useCallback(
        (e?: unknown) => {
            if (isDisabled) return
            onPressProp?.(e)
            onOpenChange(false)
        },
        [isDisabled, onPressProp, onOpenChange]
    )

    const hoverBg = hovered && !isDisabled ? 'bg-accent' : ''
    const itemClass = `flex-row items-center gap-2 px-3 py-2 ${hoverBg} ${isDisabled ? 'opacity-40' : 'opacity-100'} ${className ?? ''}`

    if (Platform.OS === 'web' && href) {
        return (
            <a
                ref={ref as React.Ref<HTMLAnchorElement>}
                href={href}
                role="menuitem"
                onClick={e => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey) return
                    e.preventDefault()
                    handlePress()
                }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                className={itemClass}
                style={{
                    display: 'flex',
                    textDecoration: 'none',
                    color: 'inherit',
                    cursor: isDisabled ? 'default' : 'pointer',
                    ...(styleProp as React.CSSProperties),
                }}
            >
                {children}
            </a>
        )
    }

    return (
        <Pressable
            ref={ref}
            onPress={handlePress}
            disabled={isDisabled}
            accessibilityRole="menuitem"
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            className={itemClass}
            style={styleProp}
        >
            {children}
        </Pressable>
    )
})

// ── ItemTitle ──

const ItemTitle = forwardRef<
    Text,
    { children: React.ReactNode; className?: string; style?: object }
>(function ItemTitle({ children, className, style: styleProp }, ref) {
    return (
        <Text
            ref={ref}
            className={`text-foreground ${className ?? ''}`}
            style={[{ fontSize: 14 }, styleProp]}
        >
            {children}
        </Text>
    )
})

// ── Label ──

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <Text
            className={`uppercase px-3 py-1 text-muted-foreground ${className ?? ''}`}
            style={{
                fontSize: 11,
                fontWeight: '600',
                letterSpacing: 0.5,
            }}
        >
            {children}
        </Text>
    )
}

// ── Separator ──

function Separator({ className }: { className?: string }) {
    return (
        <View
            className={`my-1 h-px bg-border ${className ?? ''}`}
        />
    )
}

// ── Assemble compound component ──

const Menu = Object.assign(MenuRoot, {
    Trigger,
    Portal,
    Overlay,
    Content,
    Item,
    ItemTitle,
    Label,
})

export { Menu, Separator }
