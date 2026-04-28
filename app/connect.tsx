import { ConnectIllustration } from '@tinycld/core/components/connect/ConnectIllustration'
import { getCoreConfigOptional } from '@tinycld/core/lib/core-config'
import {
    normalizeAddress,
    probe,
    setResolvedAddress,
    writeCached,
} from '@tinycld/core/lib/server-address'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { TextInput, useForm, z, zodResolver } from '@tinycld/core/ui/form'
import { router, useLocalSearchParams } from 'expo-router'
import { ChevronDown, Globe, Server, X } from 'lucide-react-native'
import { useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const FALLBACK_DEFAULT_SERVER = 'https://tinycld.org'

const urlSchema = z.object({
    url: z.string().min(1, 'Enter a server address.'),
})

export default function Connect() {
    const { backTo } = useLocalSearchParams<{ backTo?: string }>()
    const config = getCoreConfigOptional()
    const brandName = config?.brandName ?? 'TinyCld'
    const defaultServer = config?.defaultServer ?? FALLBACK_DEFAULT_SERVER
    const defaultServerLabel = hostLabel(defaultServer) ?? 'tinycld.org'

    const [sheetOpen, setSheetOpen] = useState(false)
    const [busyDefault, setBusyDefault] = useState(false)
    const [busyCustom, setBusyCustom] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)

    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')
    const accent = useThemeColor('primary')
    const border = useThemeColor('border')
    const surface = useThemeColor('surface')

    const { control, handleSubmit, reset } = useForm({
        resolver: zodResolver(urlSchema),
        defaultValues: { url: '' },
        mode: 'onChange',
    })

    async function connectTo(addr: string) {
        await probe(addr)
        await writeCached(addr)
        setResolvedAddress(addr)
        const target = backTo?.startsWith('/') ? backTo : '/'
        router.replace(target)
    }

    async function onUseDefault() {
        setSubmitError(null)
        setBusyDefault(true)
        try {
            await connectTo(normalizeAddress(defaultServer))
        } catch (err) {
            const reason = err instanceof Error ? err.message : 'Connection failed'
            setSubmitError(`Couldn't reach ${defaultServerLabel}: ${reason}`)
            setBusyDefault(false)
        }
    }

    function openSheet() {
        setSubmitError(null)
        setSheetOpen(true)
    }

    function closeSheet() {
        setSheetOpen(false)
        setSubmitError(null)
        reset({ url: '' })
    }

    const onSubmitCustom = handleSubmit(async ({ url }) => {
        setSubmitError(null)
        setBusyCustom(true)
        const addr = normalizeAddress(url)
        try {
            await connectTo(addr)
        } catch (err) {
            const reason = err instanceof Error ? err.message : 'Connection failed'
            setSubmitError(`Couldn't reach ${addr}: ${reason}`)
            setBusyCustom(false)
        }
    })

    const busy = busyDefault || busyCustom

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingBottom: 32 }}
                showsVerticalScrollIndicator={false}
            >
                <View className="flex-row items-center gap-3 mt-4">
                    <BrandMark name={brandName} accent={accent} />
                </View>

                <View className="mt-8 mb-6">
                    <ConnectIllustration height={130} />
                </View>

                <View className="flex-row items-center gap-2 mb-2">
                    <View style={{ width: 18, height: 1, backgroundColor: accent }} />
                    <Text
                        style={{
                            fontSize: 11,
                            letterSpacing: 2,
                            color: accent,
                            fontWeight: '600',
                        }}
                    >
                        WELCOME
                    </Text>
                </View>

                <Text
                    className="text-foreground"
                    style={{
                        fontSize: 32,
                        lineHeight: 36,
                        fontWeight: '600',
                        letterSpacing: -0.8,
                        fontFamily: 'Georgia',
                    }}
                >
                    Pick a place to keep{' '}
                    <Text
                        style={{
                            fontStyle: 'italic',
                            fontWeight: '400',
                            color: accent,
                            fontFamily: 'Georgia',
                        }}
                    >
                        your stuff.
                    </Text>
                </Text>

                <Text
                    className="text-foreground"
                    style={{
                        marginTop: 14,
                        fontSize: 15,
                        lineHeight: 22,
                        opacity: 0.78,
                        maxWidth: 360,
                    }}
                >
                    {brandName} stores everything on a server you choose — no shared cloud, no
                    telemetry, nothing in our hands.
                </Text>

                {submitError && !sheetOpen ? (
                    <View className="mt-5 rounded-lg p-3 bg-danger-soft">
                        <Text className="text-xs text-danger">{submitError}</Text>
                    </View>
                ) : null}

                <View style={{ flex: 1 }} />

                <View style={{ gap: 10, marginTop: 28 }}>
                    <PrimaryCta
                        label={busyDefault ? 'Connecting…' : `Use ${defaultServerLabel}`}
                        onPress={onUseDefault}
                        disabled={busy}
                    />
                    <Pressable
                        onPress={openSheet}
                        disabled={busy}
                        className="rounded-xl border flex-row items-center justify-between px-4 py-3.5"
                        style={{
                            borderColor: border,
                            backgroundColor: surface,
                            opacity: busy ? 0.5 : 1,
                        }}
                    >
                        <View className="flex-row items-center gap-3">
                            <Server size={16} color={fg} />
                            <Text
                                className="text-foreground"
                                style={{ fontSize: 14, fontWeight: '500' }}
                            >
                                I host my own server
                            </Text>
                        </View>
                        <ChevronDown size={16} color={muted} />
                    </Pressable>
                </View>
            </ScrollView>

            <Modal
                visible={sheetOpen}
                transparent
                animationType="slide"
                onRequestClose={closeSheet}
            >
                <View style={{ flex: 1 }}>
                    <Pressable
                        onPress={closeSheet}
                        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
                    />
                    <View
                        className="bg-background"
                        style={{
                            borderTopLeftRadius: 24,
                            borderTopRightRadius: 24,
                            paddingHorizontal: 24,
                            paddingTop: 12,
                            paddingBottom: 32,
                        }}
                    >
                        <SafeAreaView edges={['bottom']}>
                            <View
                                style={{
                                    width: 38,
                                    height: 4,
                                    borderRadius: 2,
                                    backgroundColor: border,
                                    alignSelf: 'center',
                                    marginBottom: 18,
                                }}
                            />
                            <View className="flex-row items-start justify-between mb-3">
                                <View style={{ flex: 1, paddingRight: 12 }}>
                                    <Text
                                        className="text-foreground"
                                        style={{
                                            fontSize: 22,
                                            fontWeight: '600',
                                            letterSpacing: -0.4,
                                            fontFamily: 'Georgia',
                                        }}
                                    >
                                        Connect your server
                                    </Text>
                                    <Text
                                        style={{
                                            marginTop: 6,
                                            fontSize: 13,
                                            lineHeight: 19,
                                            color: muted,
                                        }}
                                    >
                                        Enter the address where your {brandName} server is running.
                                        We'll check it and remember it for next time.
                                    </Text>
                                </View>
                                <Pressable
                                    onPress={closeSheet}
                                    accessibilityLabel="Close"
                                    style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 16,
                                        borderWidth: 1,
                                        borderColor: border,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <X size={14} color={fg} />
                                </Pressable>
                            </View>

                            <TextInput
                                control={control}
                                name="url"
                                label="Server address"
                                placeholder="https://pb.example.com"
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                                hint="Usually starts with https://. If you skip the protocol, we'll add one."
                                autoFocus
                            />

                            {submitError ? (
                                <View className="rounded-lg p-3 bg-danger-soft mb-3">
                                    <Text className="text-xs text-danger">{submitError}</Text>
                                </View>
                            ) : null}

                            <PrimaryCta
                                label={busyCustom ? 'Connecting…' : 'Connect'}
                                onPress={onSubmitCustom}
                                disabled={busy}
                            />
                        </SafeAreaView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    )
}

function BrandMark({ name, accent }: { name: string; accent: string }) {
    const fg = useThemeColor('foreground')
    const bg = useThemeColor('background')
    const muted = useThemeColor('muted-foreground')
    const initial = name.charAt(0).toUpperCase()
    return (
        <View className="flex-row items-center gap-2.5">
            <View
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: fg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                }}
            >
                <Text
                    style={{
                        color: bg,
                        fontSize: 18,
                        fontWeight: '700',
                        fontFamily: 'Georgia',
                    }}
                >
                    {initial}
                </Text>
                <View
                    style={{
                        position: 'absolute',
                        top: 5,
                        right: 5,
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: accent,
                    }}
                />
            </View>
            <View>
                <Text
                    className="text-foreground"
                    style={{ fontSize: 15, fontWeight: '600', fontFamily: 'Georgia' }}
                >
                    {name}
                </Text>
                <Text
                    style={{
                        fontSize: 9,
                        letterSpacing: 1.6,
                        color: muted,
                        marginTop: 1,
                        fontWeight: '600',
                    }}
                >
                    YOUR DATA, AT HOME
                </Text>
            </View>
        </View>
    )
}

function PrimaryCta({
    label,
    onPress,
    disabled,
}: {
    label: string
    onPress: () => void
    disabled?: boolean
}) {
    const fg = useThemeColor('foreground')
    const bg = useThemeColor('background')
    const accent = useThemeColor('primary')
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={{
                backgroundColor: fg,
                borderRadius: 14,
                paddingVertical: 16,
                paddingHorizontal: 20,
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
                opacity: disabled ? 0.55 : 1,
            }}
        >
            <View
                style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: 4,
                    backgroundColor: accent,
                }}
            />
            <View className="flex-row items-center gap-2">
                <Globe size={16} color={bg} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: bg }}>{label}</Text>
            </View>
        </Pressable>
    )
}

function hostLabel(url: string | undefined): string | null {
    if (!url) return null
    try {
        return new URL(url).host
    } catch {
        return null
    }
}
