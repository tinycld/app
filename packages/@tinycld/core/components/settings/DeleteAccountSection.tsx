import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { DeleteAccountModal } from './DeleteAccountModal'

export function DeleteAccountSection() {
    const [isOpen, setIsOpen] = useState(false)
    const foregroundColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const dangerBg = useThemeColor('danger')
    const dangerFg = useThemeColor('danger-foreground')
    const borderColor = useThemeColor('border')
    const surfaceBg = useThemeColor('surface-secondary')

    return (
        <View className="gap-3">
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: foregroundColor }}>
                Account
            </Text>
            <View
                className="rounded-xl border p-4 gap-2"
                style={{ backgroundColor: surfaceBg, borderColor }}
            >
                <Text style={{ fontSize: 16, fontWeight: '600', color: foregroundColor }}>
                    Delete account
                </Text>
                <Text style={{ fontSize: 13, color: mutedColor }}>
                    Permanently remove your account and associated data from this server.
                </Text>
                <Pressable
                    onPress={() => setIsOpen(true)}
                    className="self-start rounded-lg mt-1 px-3 py-2"
                    style={{ backgroundColor: dangerBg }}
                >
                    <Text style={{ color: dangerFg, fontWeight: '600' }}>Delete my account</Text>
                </Pressable>
            </View>
            <DeleteAccountModal isVisible={isOpen} onClose={() => setIsOpen(false)} />
        </View>
    )
}
