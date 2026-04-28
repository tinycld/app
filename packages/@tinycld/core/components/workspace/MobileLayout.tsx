import { Slot } from 'expo-router'
import { Platform, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NotificationDrawer } from '@tinycld/core/components/NotificationDrawer'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { MobileDrawer } from './MobileDrawer'
import { MobileTabBar } from './MobileTabBar'
import { MoreDrawer } from './MoreDrawer'
import { PackageProviderWrapper } from './PackageProviderWrapper'
import { useWorkspaceLayout } from './useWorkspaceLayout'

export function MobileLayout({ isReady = true }: { isReady?: boolean }) {
    const { isDrawerOpen } = useWorkspaceLayout()
    const insets = useSafeAreaInsets()
    const bgColor = useThemeColor('background')

    return (
        <PackageProviderWrapper>
            <View
                className="flex-1"
                style={[
                    {
                        backgroundColor: bgColor,
                        paddingTop: insets.top,
                    },
                    Platform.OS === 'web' ? ({ height: '100vh' } as object) : undefined,
                ]}
            >
                <View className="flex-1 overflow-hidden">
                    <Slot />
                    {isReady && <MoreDrawer />}
                    {isReady && <NotificationDrawer mobile />}
                </View>
                {isReady && <MobileTabBar />}
                {isReady && <MobileDrawer isVisible={isDrawerOpen} />}
            </View>
        </PackageProviderWrapper>
    )
}
