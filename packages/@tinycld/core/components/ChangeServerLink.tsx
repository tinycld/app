import { router } from 'expo-router'
import { Pressable, Text } from 'react-native'
import { disconnectServer } from '@tinycld/core/lib/pocketbase'

export function ChangeServerLink() {
    async function onPress() {
        await disconnectServer()
        router.replace('/connect?backTo=/')
    }

    return (
        <Pressable onPress={onPress} accessibilityRole="link">
            <Text className="text-xs text-muted-foreground underline">Change server</Text>
        </Pressable>
    )
}
