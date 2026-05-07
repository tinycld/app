import { Link } from 'expo-router'
import { Building2, type LucideIcon, Settings } from 'lucide-react-native'
import { View } from 'react-native'
import { NotificationBell } from '@tinycld/core/components/NotificationBell'
import { OrgLogo } from '@tinycld/core/components/OrgLogo'
import { ImportIndicator } from '@tinycld/core/components/workspace/ImportIndicator'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
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
    const { org } = useOrgInfo()

    return (
        <View
            className="w-16 justify-between items-center py-3 z-[300]"
            style={{ backgroundColor: railBg }}
        >
            <View className="items-center gap-1">
                <Link
                    testID="nav-home"
                    href={orgHref('')}
                    className="flex w-11 h-11 rounded-xl justify-center items-center relative"
                    aria-label="Organization home"
                >
                    <OrgLogo
                        org={org}
                        size={32}
                        fallback={<Building2 size={24} color={railText} />}
                    />
                </Link>

                <View
                    className="w-7 h-px opacity-20 my-2"
                    style={{ backgroundColor: railText }}
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

                <Link
                    testID="nav-settings"
                    href={orgHref('settings')}
                    className="flex w-11 h-11 rounded-xl justify-center items-center relative"
                    aria-label="Settings"
                >
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
            testID={`nav-${slug}`}
            href={orgHref(slug as never)}
            className="flex w-11 h-11 rounded-xl justify-center items-center relative"
            style={isActive ? { backgroundColor: `${activeColor}22` } : undefined}
            aria-label={label}
        >
            {isActive && (
                <View
                    className="absolute -left-2 w-1 h-5 rounded-sm"
                    style={{ backgroundColor: activeColor }}
                />
            )}
            <Icon size={22} color={textColor} />
        </Link>
    )
}
