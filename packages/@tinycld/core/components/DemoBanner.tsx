import { Info } from 'lucide-react-native'
import { Text, View } from 'react-native'
import { useAuth } from '@tinycld/core/lib/auth'
import { hexToRgba } from '@tinycld/core/lib/color-utils'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'

/**
 * Persistent ribbon shown to demo accounts so reviewers and prospects don't
 * confuse simulated sends with real ones. Outbound side effects (mail send,
 * invite/share emails, Expo push) are suppressed server-side; this banner is
 * the user-visible cue. Returns null for non-demo users.
 */
export function DemoBanner() {
    const { user, isLoggedIn } = useAuth({ throwIfAnon: false })
    const warning = useThemeColor('warning')
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')

    if (!isLoggedIn || !user?.isDemo) return null

    return (
        <View
            style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: hexToRgba(warning, 0.18),
                borderBottomWidth: 1,
                borderBottomColor: hexToRgba(warning, 0.4),
            }}
        >
            <Info size={14} color={warning} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: fg }}>
                Demo mode
            </Text>
            <Text style={{ fontSize: 12, color: muted }} numberOfLines={1}>
                outbound email and notifications are simulated.
            </Text>
        </View>
    )
}
