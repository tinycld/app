import { router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useAuth } from '@tinycld/core/lib/auth'
import { clearCached, setResolvedAddress } from '@tinycld/core/lib/server-address'

export function DisconnectServerSection() {
    const { logout } = useAuth()

    async function onDisconnect() {
        logout()
        await clearCached()
        setResolvedAddress(null)
        router.replace('/connect')
    }

    return (
        <View className="gap-3">
            <Text className="text-xl font-bold text-foreground">Server</Text>
            <View className="rounded-xl border border-border bg-surface-secondary p-4 gap-2">
                <Text className="text-base font-semibold text-foreground">Disconnect server</Text>
                <Text className="text-[13px] text-muted-foreground">
                    Sign out and forget this server. Your account on the server is not deleted.
                </Text>
                <Pressable
                    onPress={onDisconnect}
                    className="self-start rounded-lg mt-1 px-3 py-2 border border-border"
                >
                    <Text className="text-foreground font-semibold">Disconnect</Text>
                </Pressable>
            </View>
        </View>
    )
}
