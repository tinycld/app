import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { ChangeServerLink } from '@tinycld/core/components/ChangeServerLink'
import { ReviewModeHints } from '@tinycld/core/components/connect/ReviewModeHints'
import { useAuth } from '@tinycld/core/lib/auth'
import { navigateToOrg } from '@tinycld/core/lib/org-url'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'

export function LoginModal() {
    const fgColor = useThemeColor('foreground')
    const bgColor = useThemeColor('background')
    const borderColor = useThemeColor('border')
    const surfaceBg = useThemeColor('surface-secondary')
    const mutedColor = useThemeColor('muted-foreground')
    const primaryBg = useThemeColor('primary')
    const primaryFg = useThemeColor('primary-foreground')
    const backdropColor = useThemeColor('overlay-backdrop')
    const { login } = useAuth({ throwIfAnon: false })
    const [identifier, setIdentifier] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const canSubmit = identifier.trim().length > 0 && password.length > 0 && !isSubmitting

    const handleSubmit = async () => {
        if (!canSubmit) return
        setError(null)
        setIsSubmitting(true)
        const result = await login(identifier.trim(), password)
        if (result.error) {
            setError(result.error)
            setIsSubmitting(false)
        } else if (result.user?.primaryOrgSlug) {
            navigateToOrg(result.user.primaryOrgSlug)
        }
    }

    return (
        <View
            className="absolute top-0 left-0 right-0 bottom-0 justify-center items-center"
            style={{
                zIndex: 200,
                backgroundColor: backdropColor,
            }}
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
                    Sign in
                </Text>
                <Text style={{ fontSize: 14, marginBottom: 24, color: mutedColor }}>
                    Sign in to your account to continue
                </Text>

                {error && (
                    <View className="rounded-lg p-3 mb-4 bg-danger-soft">
                        <Text className="text-sm text-danger">{error}</Text>
                    </View>
                )}

                <View className="mb-4">
                    <Text
                        className="mb-1.5"
                        style={{ fontSize: 14, fontWeight: '600', color: fgColor }}
                    >
                        Username or email
                    </Text>
                    <TextInput
                        className="border rounded-lg p-3"
                        style={{
                            fontSize: 16,
                            color: fgColor,
                            borderColor,
                            backgroundColor: surfaceBg,
                        }}
                        testID="identifier"
                        value={identifier}
                        onChangeText={setIdentifier}
                        placeholder="alice or alice@company.com"
                        placeholderTextColor={mutedColor}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="username"
                        editable={!isSubmitting}
                    />
                </View>

                <View className="mb-4">
                    <Text
                        className="mb-1.5"
                        style={{ fontSize: 14, fontWeight: '600', color: fgColor }}
                    >
                        Password
                    </Text>
                    <TextInput
                        className="border rounded-lg p-3"
                        style={{
                            fontSize: 16,
                            color: fgColor,
                            borderColor,
                            backgroundColor: surfaceBg,
                        }}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Password"
                        placeholderTextColor={mutedColor}
                        secureTextEntry
                        autoComplete="current-password"
                        editable={!isSubmitting}
                        onSubmitEditing={handleSubmit}
                    />
                </View>

                <Pressable
                    className={`rounded-lg items-center mt-2 p-3.5 ${canSubmit ? 'opacity-100' : 'opacity-50'}`}
                    style={{ backgroundColor: primaryBg }}
                    onPress={handleSubmit}
                    disabled={!canSubmit}
                >
                    {isSubmitting ? (
                        <ActivityIndicator color={primaryFg} size="small" />
                    ) : (
                        <Text style={{ fontSize: 16, fontWeight: '600', color: primaryFg }}>
                            Sign in
                        </Text>
                    )}
                </Pressable>

                <ReviewModeHints
                    onPrefill={(id, password) => {
                        setIdentifier(id)
                        setPassword(password)
                    }}
                />

                <View style={{ marginTop: 16, alignItems: 'center' }}>
                    <ChangeServerLink />
                </View>
            </View>
        </View>
    )
}
