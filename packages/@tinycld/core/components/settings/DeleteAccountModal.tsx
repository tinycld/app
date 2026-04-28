import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { deleteMyAccount } from '@tinycld/core/lib/account-delete'
import { useAuth } from '@tinycld/core/lib/auth'
import { errorToString } from '@tinycld/core/lib/errors'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'

interface DeleteAccountModalProps {
    isVisible: boolean
    onClose: () => void
}

export function DeleteAccountModal({ isVisible, onClose }: DeleteAccountModalProps) {
    const { user, logout } = useAuth()
    const [typed, setTyped] = useState('')
    const [error, setError] = useState<string | null>(null)

    const fgColor = useThemeColor('foreground')
    const bgColor = useThemeColor('background')
    const borderColor = useThemeColor('border')
    const surfaceBg = useThemeColor('surface-secondary')
    const mutedColor = useThemeColor('muted-foreground')
    const backdropColor = useThemeColor('overlay-backdrop')
    const dangerBg = useThemeColor('danger')
    const dangerFg = useThemeColor('danger-foreground')

    const mutation = useMutation({
        mutationFn: async (email: string) => {
            await deleteMyAccount(email)
        },
        onSuccess: () => {
            logout()
            router.replace('/connect')
        },
        onError: err => setError(errorToString(err)),
    })

    if (!isVisible) return null

    const expected = user.email.trim().toLowerCase()
    const canSubmit = typed.trim().toLowerCase() === expected && !mutation.isPending

    const handleCancel = () => {
        if (mutation.isPending) return
        setTyped('')
        setError(null)
        onClose()
    }

    const handleSubmit = () => {
        if (!canSubmit) return
        setError(null)
        mutation.mutate(typed.trim())
    }

    return (
        <View
            className="absolute top-0 left-0 right-0 bottom-0 justify-center items-center"
            style={{ zIndex: 200, backgroundColor: backdropColor }}
        >
            <View
                className="rounded-2xl border p-8"
                style={{
                    width: 400,
                    maxWidth: '90%',
                    backgroundColor: bgColor,
                    borderColor,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.15,
                    shadowRadius: 24,
                    elevation: 8,
                }}
            >
                <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 4, color: fgColor }}>
                    Delete account
                </Text>
                <Text style={{ fontSize: 14, marginBottom: 8, color: mutedColor }}>
                    This action is permanent and cannot be undone. All your data will be deleted.
                </Text>
                <Text style={{ fontSize: 14, marginBottom: 24, color: mutedColor }}>
                    Signed in as{' '}
                    <Text style={{ fontWeight: '600', color: fgColor }}>{user.email}</Text>
                </Text>

                {error && (
                    <View className="rounded-lg p-3 mb-4 bg-danger-soft">
                        <Text className="text-sm text-danger">{error}</Text>
                    </View>
                )}

                <View className="mb-6">
                    <Text
                        className="mb-1.5"
                        style={{ fontSize: 14, fontWeight: '600', color: fgColor }}
                    >
                        Type your email to confirm
                    </Text>
                    <TextInput
                        className="border rounded-lg p-3"
                        style={{
                            fontSize: 16,
                            color: fgColor,
                            borderColor,
                            backgroundColor: surfaceBg,
                        }}
                        value={typed}
                        onChangeText={setTyped}
                        placeholder={user.email}
                        placeholderTextColor={mutedColor}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        editable={!mutation.isPending}
                        onSubmitEditing={handleSubmit}
                    />
                </View>

                <Pressable
                    className={`rounded-lg items-center p-3.5 mb-3 ${canSubmit ? 'opacity-100' : 'opacity-50'}`}
                    style={{ backgroundColor: dangerBg }}
                    onPress={handleSubmit}
                    disabled={!canSubmit}
                >
                    {mutation.isPending ? (
                        <ActivityIndicator color={dangerFg} size="small" />
                    ) : (
                        <Text style={{ fontSize: 16, fontWeight: '600', color: dangerFg }}>
                            Delete account
                        </Text>
                    )}
                </Pressable>

                <Pressable
                    className={`rounded-lg items-center p-3.5 border ${mutation.isPending ? 'opacity-50' : 'opacity-100'}`}
                    style={{ borderColor }}
                    onPress={handleCancel}
                    disabled={mutation.isPending}
                >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: fgColor }}>Cancel</Text>
                </Pressable>
            </View>
        </View>
    )
}
