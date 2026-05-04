import type { LucideIcon } from 'lucide-react-native'
import { forwardRef } from 'react'
import { Platform, Pressable, type View } from 'react-native'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'

interface ToolbarIconButtonProps {
    icon: LucideIcon
    label: string
    onPress?: () => void
    size?: number
    color?: string
    disabled?: boolean
}

export const ToolbarIconButton = forwardRef<View, ToolbarIconButtonProps>(function ToolbarIconButton(
    { icon: Icon, label, onPress, size = 18, color, disabled },
    ref
) {
    const mutedColor = useThemeColor('muted-foreground')
    const iconColor = color ?? mutedColor

    const padding = Platform.OS === 'web' ? 'p-2' : 'p-3'

    const button = (
        <Pressable
            ref={ref}
            className={`${padding} rounded-full ${disabled ? 'opacity-40' : 'opacity-100'}`}
            onPress={onPress}
            accessibilityLabel={label}
            disabled={disabled}
        >
            <Icon size={size} color={iconColor} />
        </Pressable>
    )

    if (Platform.OS !== 'web') return button

    return (
        <div title={label} style={{ display: 'inline-flex' }}>
            {button}
        </div>
    )
})
