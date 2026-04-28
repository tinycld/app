import { router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useAuth } from '@tinycld/core/lib/auth'
import { clearCached, setResolvedAddress } from '@tinycld/core/lib/server-address'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'

export function DisconnectServerSection() {
    const { logout } = useAuth()
    const foregroundColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const borderColor = useThemeColor('border')
    const surfaceBg = useThemeColor('surface-secondary')

    async function onDisconnect() {
        logout()
        await clearCached()
        setResolvedAddress(null)
        router.replace('/connect')
    }

    return (
        <View className="gap-3">
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: foregroundColor }}>Server</Text>
            <View
                className="rounded-xl border p-4 gap-2"
                style={{ backgroundColor: surfaceBg, borderColor }}
            >
                <Text style={{ fontSize: 16, fontWeight: '600', color: foregroundColor }}>
                    Disconnect server
                </Text>
                <Text style={{ fontSize: 13, color: mutedColor }}>
                    Sign out and forget this server. Your account on the server is not deleted.
                </Text>
                <Pressable
                    onPress={onDisconnect}
                    className="self-start rounded-lg mt-1 px-3 py-2 border"
                    style={{ borderColor }}
                >
                    <Text style={{ color: foregroundColor, fontWeight: '600' }}>Disconnect</Text>
                </Pressable>
            </View>
        </View>
    )
}
