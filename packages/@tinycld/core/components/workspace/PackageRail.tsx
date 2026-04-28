import { Link } from 'expo-router'
import { Building2, type LucideIcon, Settings } from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'
import { NotificationBell } from '@tinycld/core/components/NotificationBell'
import { ImportIndicator } from '@tinycld/core/components/workspace/ImportIndicator'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useSortedPackages } from '@tinycld/core/lib/use-sorted-packages'
import { getIcon } from './package-icon-map'
import { UserMenu } from './UserMenu'
import { useWorkspaceLayout } from './useWorkspaceLayout'

export function PackageRail() {
    const railBg = useThemeColor('rail-background')
    const railText = useThemeColor('rail-text')
    const railActive = useThemeColor('rail-active-text')
    const indicatorColor = useThemeColor('active-indicator')
    const sorted = useSortedPackages()
    const { activePkgSlug } = useWorkspaceLayout()
    const orgHref = useOrgHref()

    return (
        <View
            style={{
                width: 64,
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: 12,
                backgroundColor: railBg,
                zIndex: 300,
            }}
        >
            <View className="items-center gap-1">
                <Link href={orgHref('')} style={styles.railItem} aria-label="Organization home">
                    <Building2 size={24} color={railText} />
                </Link>

                <View
                    style={{
                        width: 28,
                        height: 1,
                        opacity: 0.2,
                        marginVertical: 8,
                        backgroundColor: railText,
                    }}
                />

                {sorted.map(pkg => {
                    const Icon = getIcon(pkg.nav?.icon ?? '')
                    const isActive = activePkgSlug === pkg.slug
                    return (
                        <PackageRailItem
                            key={pkg.slug}
                            slug={pkg.slug}
                            label={pkg.nav?.label ?? ''}
                            Icon={Icon}
                            isActive={isActive}
                            activeColor={indicatorColor}
                            textColor={isActive ? railActive : railText}
                        />
                    )
                })}
            </View>

            <View className="items-center gap-2">
                <ImportIndicator />
                <NotificationBell color={railText} />

                <Link href={orgHref('settings')} style={styles.railItem} aria-label="Settings">
                    <Settings size={22} color={railText} />
                </Link>

                <UserMenu />
            </View>
        </View>
    )
}

function PackageRailItem({
    slug,
    label,
    Icon,
    isActive,
    activeColor,
    textColor,
}: {
    slug: string
    label: string
    Icon: LucideIcon
    isActive: boolean
    activeColor: string
    textColor: string
}) {
    const orgHref = useOrgHref()

    return (
        <Link
            href={orgHref(slug as never)}
            style={[styles.railItem, isActive && { backgroundColor: `${activeColor}22` }]}
            aria-label={label}
        >
            {isActive && (
                <View
                    style={{
                        position: 'absolute',
                        left: -8,
                        width: 4,
                        height: 20,
                        borderRadius: 2,
                        backgroundColor: activeColor,
                    }}
                />
            )}
            <Icon size={22} color={textColor} />
        </Link>
    )
}

const styles = StyleSheet.create({
    railItem: {
        display: 'flex',
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
})
