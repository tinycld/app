import { Lock } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { FormErrorSummary, TextInput, useForm, z, zodResolver } from '@tinycld/core/ui/form'

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1, 'Password is required'),
})

interface SuperuserLoginFormProps {
    login: (email: string, password: string) => Promise<void>
    error: string | null
    isLoading: boolean
}

export function SuperuserLoginForm({ login, error, isLoading }: SuperuserLoginFormProps) {
    const fgColor = useThemeColor('foreground')
    const surfaceBg = useThemeColor('surface-secondary')
    const borderColor = useThemeColor('border')
    const mutedColor = useThemeColor('muted-foreground')
    const primaryBg = useThemeColor('primary')
    const primaryFgColor = useThemeColor('primary-foreground')
    const surfaceColor = useThemeColor('surface')
    const {
        control,
        handleSubmit,
        formState: { errors, isSubmitted },
    } = useForm({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: '', password: '' },
        mode: 'onChange',
    })

    const onSubmit = handleSubmit(data => login(data.email, data.password))

    return (
        <View
            className="gap-4 p-5 self-center rounded-xl border"
            style={{
                maxWidth: 380,
                width: '90%',
                backgroundColor: surfaceBg,
                borderColor,
            }}
        >
            <View className="gap-2 items-center">
                <View
                    className="size-10 rounded-lg items-center justify-center"
                    style={{
                        backgroundColor: surfaceColor,
                    }}
                >
                    <Lock size={18} color={fgColor} />
                </View>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: fgColor }}>
                    Superuser Login
                </Text>
                <Text className="text-center" style={{ fontSize: 12, color: mutedColor }}>
                    Authenticate with PocketBase to manage organizations.
                </Text>
            </View>

            <FormErrorSummary errors={errors} isEnabled={isSubmitted} />

            {error && (
                <View className="rounded-lg p-2 bg-danger-soft">
                    <Text className="text-xs text-danger">{error}</Text>
                </View>
            )}

            <TextInput
                control={control}
                name="email"
                label="Email"
                placeholder="admin@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
            />

            <TextInput
                control={control}
                name="password"
                label="Password"
                placeholder="Password"
                secureTextEntry
            />

            <Pressable
                onPress={onSubmit}
                disabled={isLoading}
                className={`px-4 py-3 rounded-lg items-center ${isLoading ? 'opacity-60' : 'opacity-100'}`}
                style={{ backgroundColor: primaryBg }}
            >
                <Text style={{ fontWeight: '600', color: primaryFgColor }}>
                    {isLoading ? 'Signing in...' : 'Sign in'}
                </Text>
            </Pressable>
        </View>
    )
}
