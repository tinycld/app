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

    if (!isLoggedIn || !user?.isDemo) return null

    return (
        <View
            className="py-1.5 px-3 flex-row items-center gap-2 border-b"
            style={{
                backgroundColor: hexToRgba(warning, 0.18),
                borderBottomColor: hexToRgba(warning, 0.4),
            }}
        >
            <Info size={14} color={warning} />
            <Text className="text-xs font-semibold text-foreground">Demo mode</Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                outbound email and notifications are simulated.
            </Text>
        </View>
    )
}
