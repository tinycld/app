import { router } from 'expo-router'
import { Pressable, Text } from 'react-native'
import { clearCached } from '@tinycld/core/lib/server-address'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'

export function ChangeServerLink() {
    const mutedColor = useThemeColor('muted-foreground')

    async function onPress() {
        await clearCached()
        router.replace('/connect?backTo=/')
    }

    return (
        <Pressable onPress={onPress} accessibilityRole="link">
            <Text style={{ fontSize: 12, color: mutedColor, textDecorationLine: 'underline' }}>
                Change server
            </Text>
        </Pressable>
    )
}
