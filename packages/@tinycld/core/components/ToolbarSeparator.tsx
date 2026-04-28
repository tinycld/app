import { View } from 'react-native'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'

interface ToolbarSeparatorProps {
    marginHorizontal?: number
}

export function ToolbarSeparator({ marginHorizontal = 4 }: ToolbarSeparatorProps) {
    const borderColor = useThemeColor('border')
    return (
        <View
            className="w-px h-5"
            style={{
                backgroundColor: borderColor,
                marginHorizontal,
            }}
        />
    )
}
