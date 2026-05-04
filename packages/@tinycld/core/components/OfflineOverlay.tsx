import { WifiOff } from 'lucide-react-native'
import { Platform, Text, View } from 'react-native'
import {
    selectIsOffline,
    useConnectivityStore,
} from '@tinycld/core/lib/stores/connectivity-store'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'

export function OfflineOverlay() {
    const isOffline = useConnectivityStore(selectIsOffline)
    const warningColor = useThemeColor('warning')

    if (!isOffline) return null

    const isWeb = Platform.OS === 'web'
    const fillStyle = isWeb
        ? ({ position: 'fixed', inset: 0 } as unknown as object)
        : { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 }

    return (
        <View
            testID="offline-overlay"
            style={{ ...fillStyle, zIndex: 10001, alignItems: 'center', justifyContent: 'center' }}
            className="bg-warning-soft"
            pointerEvents="auto"
        >
            <View
                className="bg-background border-border max-w-sm w-[88%] rounded-2xl border p-6"
                style={
                    isWeb
                        ? { boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }
                        : {
                              elevation: 6,
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: 0.12,
                              shadowRadius: 12,
                          }
                }
            >
                <View className="items-center gap-4">
                    <WifiOff size={36} color={warningColor} />
                    <Text className="text-lg font-semibold text-foreground text-center">
                        You're offline
                    </Text>
                    <Text className="text-sm text-muted-foreground text-center">
                        Reconnect to keep working. We'll dismiss this automatically once you're back
                        online.
                    </Text>
                </View>
            </View>
        </View>
    )
}
