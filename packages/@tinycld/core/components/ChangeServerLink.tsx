import { router } from 'expo-router'
import { Pressable, Text } from 'react-native'
import { clearCached } from '@tinycld/core/lib/server-address'

export function ChangeServerLink() {
    async function onPress() {
        await clearCached()
        router.replace('/connect?backTo=/')
    }

    return (
        <Pressable onPress={onPress} accessibilityRole="link">
            <Text className="text-xs text-muted-foreground underline">Change server</Text>
        </Pressable>
    )
}
