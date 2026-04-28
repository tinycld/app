import { useRouter } from 'expo-router'
import { Ellipsis } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useOrgSlug } from '@tinycld/core/lib/use-org-slug'
import { useSortedPackages } from '@tinycld/core/lib/use-sorted-packages'
import { getIcon } from './package-icon-map'
import { useWorkspaceLayout } from './useWorkspaceLayout'

export const MAX_VISIBLE_TABS = 4

export function MobileTabBar() {
    const railBg = useThemeColor('rail-background')
    const railBorder = useThemeColor('border')
    const railText = useThemeColor('rail-text')
    const railActive = useThemeColor('rail-active-text')
    const indicatorColor = useThemeColor('active-indicator')
    const sorted = useSortedPackages()
    const { activePkgSlug, isMoreOpen, setMoreOpen } = useWorkspaceLayout()
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const orgSlug = useOrgSlug()

    const visiblePkgs =
        sorted.length > MAX_VISIBLE_TABS ? sorted.slice(0, MAX_VISIBLE_TABS) : sorted

    return (
        <View
            style={[
                styles.tabBar,
                {
                    backgroundColor: railBg,
                    borderTopColor: railBorder,
                    paddingBottom: insets.bottom,
                },
            ]}
        >
            {visiblePkgs.map(pkg => {
                const Icon = getIcon(pkg.nav?.icon ?? '')
                const isActive = activePkgSlug === pkg.slug
                const color = isActive ? railActive : railText
                return (
                    <Pressable
                        key={pkg.slug}
                        style={styles.tabItem}
                        onPress={() => {
                            setMoreOpen(false)
                            router.push(`/a/${orgSlug}/${pkg.slug}`)
                        }}
                        accessibilityLabel={pkg.nav?.label}
                    >
                        {isActive ? (
                            <View
                                style={[
                                    styles.activeIndicator,
                                    { backgroundColor: indicatorColor },
                                ]}
                            />
                        ) : null}
                        <Icon size={22} color={color} />
                        <Text style={[styles.tabLabel, { color }]}>{pkg.nav?.label}</Text>
                    </Pressable>
                )
            })}
            <Pressable
                style={styles.tabItem}
                onPress={() => setMoreOpen(!isMoreOpen)}
                accessibilityLabel="More"
            >
                <Ellipsis size={22} color={railText} />
                <Text style={[styles.tabLabel, { color: railText }]}>More</Text>
            </Pressable>
        </View>
    )
}

const styles = StyleSheet.create({
    tabBar: {
        flexDirection: 'row',
        paddingTop: 8,
        paddingBottom: 4,
        borderTopWidth: 1,
        alignItems: 'center',
        zIndex: 10,
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 4,
        position: 'relative',
    },
    tabLabel: {
        fontSize: 10,
        fontWeight: '500',
    },
    activeIndicator: {
        position: 'absolute',
        top: -4,
        width: 24,
        height: 3,
        borderRadius: 1.5,
    },
})
