import type { LucideIcon } from 'lucide-react-native'
import { Platform, Pressable } from 'react-native'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'

interface ToolbarIconButtonProps {
    icon: LucideIcon
    label: string
    onPress?: () => void
    size?: number
    color?: string
    disabled?: boolean
}

export function ToolbarIconButton({
    icon: Icon,
    label,
    onPress,
    size = 18,
    color,
    disabled,
}: ToolbarIconButtonProps) {
    const mutedColor = useThemeColor('muted-foreground')
    const iconColor = color ?? mutedColor

    const button = (
        <Pressable
            className={`p-2 rounded-full ${disabled ? 'opacity-40' : 'opacity-100'}`}
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
}
