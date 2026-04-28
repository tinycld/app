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
import { ChevronDown, Globe, Server } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

const FALLBACK_DEFAULT_SERVER = 'https://tinycld.org'

const urlSchema = z.object({
    url: z.string().min(1, 'Enter a server address.'),
})

export default function ConnectWeb() {
    const { backTo } = useLocalSearchParams<{ backTo?: string }>()
    const config = getCoreConfigOptional()
    const brandName = config?.brandName ?? 'TinyCld'
    const defaultServer = config?.defaultServer ?? FALLBACK_DEFAULT_SERVER
    const defaultServerLabel = hostLabel(defaultServer) ?? 'tinycld.org'

    const [expanded, setExpanded] = useState(false)
    const [busyDefault, setBusyDefault] = useState(false)
    const [busyCustom, setBusyCustom] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)

    const fg = useThemeColor('foreground')
    const bg = useThemeColor('background')
    const muted = useThemeColor('muted-foreground')
    const accent = useThemeColor('primary')
    const border = useThemeColor('border')
    const surface = useThemeColor('surface')
    const surfaceSecondary = useThemeColor('surface-secondary')

    const { control, handleSubmit } = useForm({
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
        <ScrollView
            className="flex-1 bg-background"
            contentContainerStyle={{
                flexGrow: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 32,
            }}
        >
            <View
                style={{
                    width: '100%',
                    maxWidth: 880,
                    borderRadius: 20,
                    backgroundColor: surface,
                    borderWidth: 1,
                    borderColor: border,
                    overflow: 'hidden',
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                }}
            >
                <View
                    style={{
                        flex: 1,
                        minWidth: 320,
                        padding: 40,
                        backgroundColor: surfaceSecondary,
                        borderRightWidth: 1,
                        borderRightColor: border,
                        position: 'relative',
                    }}
                >
                    <View
                        style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: 0,
                            width: 3,
                            backgroundColor: accent,
                        }}
                    />

                    <BrandMark name={brandName} accent={accent} />

                    <View
                        className="flex-row items-center gap-2"
                        style={{ marginTop: 28, marginBottom: 10 }}
                    >
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
                            fontSize: 36,
                            lineHeight: 40,
                            fontWeight: '600',
                            letterSpacing: -1,
                            fontFamily: 'Georgia',
                        }}
                    >
                        Pick where your{' '}
                        <Text
                            style={{
                                fontStyle: 'italic',
                                fontWeight: '400',
                                color: accent,
                                fontFamily: 'Georgia',
                            }}
                        >
                            stuff
                        </Text>{' '}
                        lives.
                    </Text>

                    <Text
                        className="text-foreground"
                        style={{
                            marginTop: 16,
                            fontSize: 15,
                            lineHeight: 24,
                            opacity: 0.78,
                            maxWidth: 380,
                        }}
                    >
                        {brandName} is a personal cloud — mail, calendar, files, contacts — all kept
                        on a server you choose. Use ours, or run your own. Either way, your data
                        stays on the box you point to.
                    </Text>

                    <View style={{ flex: 1 }} />

                    <View style={{ marginTop: 32 }}>
                        <ConnectIllustration height={130} />
                    </View>
                </View>

                <View
                    style={{
                        flex: 1,
                        minWidth: 320,
                        padding: 40,
                        gap: 16,
                    }}
                >
                    <Pressable
                        onPress={onUseDefault}
                        disabled={busy}
                        style={{
                            borderWidth: 1.5,
                            borderColor: fg,
                            backgroundColor: fg,
                            borderRadius: 14,
                            padding: 18,
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            gap: 14,
                            opacity: busy ? 0.6 : 1,
                        }}
                    >
                        <View
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: 'rgba(255,255,255,0.12)',
                            }}
                        >
                            <Globe size={18} color={bg} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text
                                style={{
                                    color: bg,
                                    fontSize: 15,
                                    fontWeight: '600',
                                    letterSpacing: -0.2,
                                }}
                            >
                                {busyDefault ? 'Connecting…' : `Use ${defaultServerLabel}`}
                            </Text>
                            <Text
                                style={{
                                    color: bg,
                                    opacity: 0.7,
                                    fontSize: 13,
                                    lineHeight: 19,
                                    marginTop: 3,
                                }}
                            >
                                Hosted by us. Free to start — fully encrypted, fully yours, no setup
                                required.
                            </Text>
                        </View>
                    </Pressable>

                    <View className="flex-row items-center gap-3">
                        <View style={{ flex: 1, height: 1, backgroundColor: border }} />
                        <Text
                            style={{
                                fontSize: 11,
                                letterSpacing: 2,
                                color: muted,
                                fontWeight: '600',
                            }}
                        >
                            OR
                        </Text>
                        <View style={{ flex: 1, height: 1, backgroundColor: border }} />
                    </View>

                    <View
                        style={{
                            borderWidth: 1.5,
                            borderColor: border,
                            borderRadius: 14,
                            backgroundColor: surface,
                            overflow: 'hidden',
                        }}
                    >
                        <Pressable
                            onPress={() => setExpanded(open => !open)}
                            disabled={busy}
                            style={{
                                padding: 18,
                                flexDirection: 'row',
                                alignItems: 'flex-start',
                                gap: 14,
                            }}
                        >
                            <View
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 10,
                                    backgroundColor: surfaceSecondary,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <Server size={18} color={fg} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text
                                    className="text-foreground"
                                    style={{ fontSize: 15, fontWeight: '600', letterSpacing: -0.2 }}
                                >
                                    I run my own server
                                </Text>
                                <Text
                                    style={{
                                        color: muted,
                                        fontSize: 13,
                                        lineHeight: 19,
                                        marginTop: 3,
                                    }}
                                >
                                    Self-hosted, on your machine or somewhere you rent.
                                </Text>
                            </View>
                            <View
                                style={{
                                    marginTop: 8,
                                    transform: [{ rotate: expanded ? '180deg' : '0deg' }],
                                }}
                            >
                                <ChevronDown size={18} color={muted} />
                            </View>
                        </Pressable>

                        {expanded ? (
                            <View
                                style={{
                                    paddingHorizontal: 18,
                                    paddingBottom: 18,
                                    borderTopWidth: 1,
                                    borderTopColor: border,
                                    paddingTop: 16,
                                    gap: 12,
                                }}
                            >
                                <TextInput
                                    control={control}
                                    name="url"
                                    label="Server address"
                                    placeholder="https://pb.example.com"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    keyboardType="url"
                                    hint="We'll ping /api/health to make sure it's listening."
                                />

                                {submitError ? (
                                    <View className="rounded-lg p-3 bg-danger-soft">
                                        <Text className="text-xs text-danger">{submitError}</Text>
                                    </View>
                                ) : null}

                                <Pressable
                                    onPress={onSubmitCustom}
                                    disabled={busy}
                                    style={{
                                        alignSelf: 'flex-start',
                                        backgroundColor: fg,
                                        borderRadius: 11,
                                        paddingVertical: 11,
                                        paddingHorizontal: 18,
                                        opacity: busy ? 0.55 : 1,
                                    }}
                                >
                                    <Text style={{ color: bg, fontSize: 14, fontWeight: '600' }}>
                                        {busyCustom ? 'Connecting…' : 'Connect'}
                                    </Text>
                                </Pressable>
                            </View>
                        ) : null}
                    </View>

                    {submitError && !expanded ? (
                        <View className="rounded-lg p-3 bg-danger-soft">
                            <Text className="text-xs text-danger">{submitError}</Text>
                        </View>
                    ) : null}
                </View>
            </View>
        </ScrollView>
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
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    backgroundColor: fg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                }}
            >
                <Text
                    style={{
                        color: bg,
                        fontSize: 16,
                        fontWeight: '700',
                        fontFamily: 'Georgia',
                    }}
                >
                    {initial}
                </Text>
                <View
                    style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 5,
                        height: 5,
                        borderRadius: 2.5,
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

function hostLabel(url: string | undefined): string | null {
    if (!url) return null
    try {
        return new URL(url).host
    } catch {
        return null
    }
}
