import Constants from 'expo-constants'
import { Linking, Pressable, Text, View } from 'react-native'
import { getCoreConfigOptional } from '@tinycld/core/lib/core-config'
import { getResolvedAddress } from '@tinycld/core/lib/server-address'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'

const DEFAULT_PRIVACY_URL = 'https://tinycld.org/privacy'
const DEFAULT_SOURCE_URL = 'https://github.com/tinycld/core'

export function AboutSection() {
    const foregroundColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const primaryColor = useThemeColor('primary')
    const borderColor = useThemeColor('border')
    const surfaceBg = useThemeColor('surface-secondary')

    const config = getCoreConfigOptional()
    const version = Constants.expoConfig?.version ?? 'unknown'
    const rawCommit = config?.release ?? 'dev'
    const commit = rawCommit.slice(0, 7)
    const server = getResolvedAddress() ?? 'not connected'
    const privacyUrl = config?.privacyUrl ?? DEFAULT_PRIVACY_URL
    const sourceUrl = config?.sourceUrl ?? DEFAULT_SOURCE_URL

    return (
        <View className="gap-3">
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: foregroundColor }}>About</Text>
            <View
                className="rounded-xl border p-4 gap-2"
                style={{ backgroundColor: surfaceBg, borderColor }}
            >
                <Row
                    label="Version"
                    value={`${version} (${commit})`}
                    fg={foregroundColor}
                    muted={mutedColor}
                />
                <Row label="Server" value={server} fg={foregroundColor} muted={mutedColor} />
                <Pressable onPress={() => Linking.openURL(privacyUrl)}>
                    <Text style={{ color: primaryColor, fontSize: 14 }}>Privacy policy</Text>
                </Pressable>
                <Pressable onPress={() => Linking.openURL(sourceUrl)}>
                    <Text style={{ color: primaryColor, fontSize: 14 }}>
                        Source code (AGPL-3.0)
                    </Text>
                </Pressable>
            </View>
        </View>
    )
}

function Row({
    label,
    value,
    fg,
    muted,
}: {
    label: string
    value: string
    fg: string
    muted: string
}) {
    return (
        <View className="flex-row justify-between items-center">
            <Text style={{ fontSize: 14, color: muted }}>{label}</Text>
            <Text style={{ fontSize: 14, color: fg }} numberOfLines={1}>
                {value}
            </Text>
        </View>
    )
}
