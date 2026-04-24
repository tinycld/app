import { getIcon } from '@tinycld/core/components/workspace/package-icon-map'
import { packageSettings } from '@tinycld/core/lib/generated/package-settings'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useCurrentRole } from '@tinycld/core/lib/use-current-role'
import { useRouter } from 'expo-router'
import { Building2, ChevronRight, Package, ScrollText, Tag, User, Users } from 'lucide-react-native'
import { Pressable, ScrollView, Text, View } from 'react-native'

export default function SettingsIndex() {
    const foregroundColor = useThemeColor('foreground')
    const bgColor = useThemeColor('background')
    const { isAdmin } = useCurrentRole()
    const orgHref = useOrgHref()
    const router = useRouter()

    return (
        <ScrollView
            className="flex-1"
            style={{ backgroundColor: bgColor }}
            contentContainerStyle={{ flexGrow: 1 }}
        >
            <View className="p-5 max-w-[600px] w-full">
                <Text
                    className="mb-4"
                    style={{
                        fontSize: 28,
                        fontWeight: 'bold',
                        color: foregroundColor,
                    }}
                >
                    Settings
                </Text>

                <SettingsGroup label="Account">
                    <SettingsLink
                        label="Personal"
                        onPress={() => router.push(orgHref('settings/personal'))}
                        icon={<User size={20} color={foregroundColor} />}
                    />
                </SettingsGroup>

                <AdminSettings isVisible={isAdmin} />
            </View>
        </ScrollView>
    )
}

function AdminSettings({ isVisible }: { isVisible: boolean }) {
    const foregroundColor = useThemeColor('foreground')
    const orgHref = useOrgHref()
    const router = useRouter()

    if (!isVisible) return null

    return (
        <>
            <SettingsGroup label="Organization">
                <SettingsLink
                    label="General"
                    onPress={() => router.push(orgHref('settings/organization'))}
                    icon={<Building2 size={20} color={foregroundColor} />}
                />
                <SettingsLink
                    label="Members"
                    onPress={() => router.push(orgHref('settings/members'))}
                    icon={<Users size={20} color={foregroundColor} />}
                />
                <SettingsLink
                    label="Labels"
                    onPress={() => router.push(orgHref('settings/labels'))}
                    icon={<Tag size={20} color={foregroundColor} />}
                />
                <SettingsLink
                    label="Packages"
                    onPress={() => router.push(orgHref('settings/packages'))}
                    icon={<Package size={20} color={foregroundColor} />}
                />
                <SettingsLink
                    label="Audit Log"
                    onPress={() => router.push(orgHref('settings/audit-log'))}
                    icon={<ScrollText size={20} color={foregroundColor} />}
                />
            </SettingsGroup>

            {packageSettings.map(group => {
                const Icon = getIcon(group.pkgSlug)
                return (
                    <SettingsGroup key={group.pkgSlug} label={group.packageName}>
                        {group.panels.map(panel => (
                            <SettingsLink
                                key={panel.slug}
                                label={panel.label}
                                onPress={() =>
                                    router.push(
                                        orgHref('settings/[...section]', {
                                            section: [group.pkgSlug, panel.slug],
                                        })
                                    )
                                }
                                icon={<Icon size={20} color={foregroundColor} />}
                            />
                        ))}
                    </SettingsGroup>
                )
            })}
        </>
    )
}

function SettingsGroup({ label, children }: { label: string; children: React.ReactNode }) {
    const primaryColor = useThemeColor('primary')
    const surfaceBg = useThemeColor('surface-secondary')
    const borderColor = useThemeColor('border')

    return (
        <View className="mb-5">
            <Text
                className="mb-2"
                style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: primaryColor,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                }}
            >
                {label}
            </Text>
            <View
                className="rounded-xl border overflow-hidden"
                style={{
                    backgroundColor: surfaceBg,
                    borderColor: borderColor,
                }}
            >
                {children}
            </View>
        </View>
    )
}

function SettingsLink({
    label,
    onPress,
    icon,
}: {
    label: string
    onPress: () => void
    icon: React.ReactNode
}) {
    const foregroundColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')

    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center justify-between px-4 py-3.5"
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
            <View className="flex-row items-center gap-3">
                {icon}
                <Text style={{ fontSize: 16, color: foregroundColor }}>{label}</Text>
            </View>
            <ChevronRight size={18} color={mutedColor} />
        </Pressable>
    )
}
