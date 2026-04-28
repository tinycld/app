import PocketBase from 'pocketbase'
import { useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { PB_SERVER_ADDR } from '@tinycld/core/lib/config'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { FormErrorSummary, TextInput, useForm, z, zodResolver } from '@tinycld/core/ui/form'
import { SetupDashboard } from './SetupDashboard'

const bootstrapSchema = z
    .object({
        appName: z.string().min(1, 'App name is required').max(255),
        email: z.string().email(),
        password: z.string().min(10, 'Min 10 characters'),
        confirmPassword: z.string(),
        appUrl: z.string().url('Must be a valid URL'),
    })
    .refine(data => data.password === data.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    })

interface SetupWizardProps {
    token: string
}

export function SetupWizard({ token }: SetupWizardProps) {
    const pbRef = useRef<PocketBase | null>(null)
    if (!pbRef.current) {
        pbRef.current = new PocketBase(PB_SERVER_ADDR)
    }
    const pb = pbRef.current

    const [isComplete, setIsComplete] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const fgColor = useThemeColor('foreground')
    const surfaceBg = useThemeColor('surface-secondary')
    const borderColor = useThemeColor('border')
    const mutedColor = useThemeColor('muted-foreground')
    const primaryBg = useThemeColor('primary')
    const primaryFgColor = useThemeColor('primary-foreground')
    const surfaceColor = useThemeColor('surface')

    const defaultAppUrl = typeof window !== 'undefined' ? window.location.origin : PB_SERVER_ADDR

    const {
        control,
        handleSubmit,
        formState: { errors, isSubmitted },
    } = useForm({
        resolver: zodResolver(bootstrapSchema),
        defaultValues: {
            appName: 'tinycld',
            email: '',
            password: '',
            confirmPassword: '',
            appUrl: defaultAppUrl,
        },
        mode: 'onChange',
    })

    const onSubmit = handleSubmit(async data => {
        setSubmitError(null)
        setIsSubmitting(true)
        try {
            const res = await fetch(`${PB_SERVER_ADDR}/api/setup/init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    appName: data.appName,
                    email: data.email,
                    password: data.password,
                    appUrl: data.appUrl,
                }),
            })
            const result = await res.json()
            if (!res.ok) {
                setSubmitError(result.error ?? 'Setup failed')
                return
            }
            pb.authStore.save(result.authToken, {
                id: '',
                email: result.email,
                collectionId: '_superusers',
                collectionName: '_superusers',
            })
            setIsComplete(true)
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Network error')
        } finally {
            setIsSubmitting(false)
        }
    })

    if (isComplete) {
        return (
            <GestureHandlerRootView className="flex-1">
                <ScrollView>
                    <SetupDashboard pb={pb} defaultTab="organizations" />
                </ScrollView>
            </GestureHandlerRootView>
        )
    }

    return (
        <View className="flex-1 items-center justify-center py-12">
            <View
                className="gap-4 p-5 self-center rounded-xl border"
                style={{
                    maxWidth: 420,
                    width: '90%',
                    backgroundColor: surfaceBg,
                    borderColor,
                }}
            >
                <View className="gap-2 items-center">
                    <View
                        className="size-10 rounded-lg items-center justify-center"
                        style={{ backgroundColor: surfaceColor }}
                    >
                        <Text style={{ fontSize: 20 }}>&#9889;</Text>
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', color: fgColor }}>
                        Welcome to TinyCld
                    </Text>
                    <Text className="text-center" style={{ fontSize: 12, color: mutedColor }}>
                        Create a superuser account to get started.
                    </Text>
                </View>

                <FormErrorSummary errors={errors} isEnabled={isSubmitted} />

                {submitError && (
                    <View className="rounded-lg p-2 bg-danger-soft">
                        <Text className="text-xs text-danger">{submitError}</Text>
                    </View>
                )}

                <TextInput
                    control={control}
                    name="appName"
                    label="Application Name"
                    placeholder="tinycld"
                />

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
                    placeholder="At least 10 characters"
                    secureTextEntry
                />

                <TextInput
                    control={control}
                    name="confirmPassword"
                    label="Confirm Password"
                    placeholder="Repeat password"
                    secureTextEntry
                />

                <TextInput
                    control={control}
                    name="appUrl"
                    label="App URL"
                    placeholder="https://your-domain.com"
                    autoCapitalize="none"
                    hint="The public URL where this instance is accessible"
                />

                <Pressable
                    onPress={onSubmit}
                    disabled={isSubmitting}
                    className={`px-4 py-3 rounded-lg items-center ${isSubmitting ? 'opacity-60' : 'opacity-100'}`}
                    style={{ backgroundColor: primaryBg }}
                >
                    <Text style={{ fontWeight: '600', color: primaryFgColor }}>
                        {isSubmitting ? 'Setting up...' : 'Create Account & Continue'}
                    </Text>
                </Pressable>
            </View>
        </View>
    )
}
