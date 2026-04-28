import type { ReactNode } from 'react'
import { Platform, View } from 'react-native'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'

interface ScreenHeaderProps {
    children: ReactNode
    isScrolled?: boolean
}

export function ScreenHeader({ children, isScrolled = false }: ScreenHeaderProps) {
    const borderColor = useThemeColor('border')

    const webShadow =
        Platform.OS === 'web'
            ? ({
                  transition: 'box-shadow 0.2s ease',
                  boxShadow: isScrolled ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
              } as Record<string, string>)
            : undefined

    return (
        <View
            style={[
                {
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                    zIndex: 1,
                    overflow: 'visible',
                },
                webShadow,
            ]}
        >
            {children}
        </View>
    )
}
