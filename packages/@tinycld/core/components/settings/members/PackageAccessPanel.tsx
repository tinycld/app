import { eq } from '@tanstack/db'
import { Pressable, Text, View } from 'react-native'
import { mutation, useMutation } from '@tinycld/core/lib/mutations'
import { usePackages } from '@tinycld/core/lib/packages/use-packages'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import type { PackageAccessLevel } from '@tinycld/core/lib/use-pkg-access'

const ACCESS_OPTIONS: { label: string; value: PackageAccessLevel | 'default' }[] = [
    { label: 'Default', value: 'default' },
    { label: 'Full', value: 'full' },
    { label: 'Read', value: 'readonly' },
    { label: 'None', value: 'none' },
]

export function PackageAccessPanel({ userOrgId }: { userOrgId: string }) {
    const packages = usePackages()
    const [orgPkgAccessCollection] = useStore('org_pkg_access')

    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const borderColor = useThemeColor('border')

    const { data: overrides } = useOrgLiveQuery(
        query =>
            query
                .from({ org_pkg_access: orgPkgAccessCollection })
                .where(({ org_pkg_access }) => eq(org_pkg_access.user_org, userOrgId)),
        [userOrgId]
    )

    const overrideMap = new Map(
        (overrides ?? []).map(o => [o.pkg, { id: o.id, access: o.access as PackageAccessLevel }])
    )

    const upsertAccess = useMutation({
        mutationFn: mutation(function* ({
            pkg,
            access,
        }: {
            pkg: string
            access: PackageAccessLevel
        }) {
            const existing = overrideMap.get(pkg)
            if (existing) {
                yield orgPkgAccessCollection.update(existing.id, draft => {
                    draft.access = access
                })
            } else {
                yield orgPkgAccessCollection.insert({
                    id: crypto.randomUUID().replace(/-/g, '').slice(0, 15),
                    user_org: userOrgId,
                    pkg,
                    access,
                    created: '',
                    updated: '',
                })
            }
        }),
    })

    const clearAccess = useMutation({
        mutationFn: mutation(function* ({ pkg }: { pkg: string }) {
            const existing = overrideMap.get(pkg)
            if (existing) {
                yield orgPkgAccessCollection.delete(existing.id)
            }
        }),
    })

    if (packages.length === 0) {
        return (
            <Text style={{ fontSize: 12.5, color: mutedColor, fontStyle: 'italic' }}>
                No installed packages yet.
            </Text>
        )
    }

    return (
        <View className="gap-2.5">
            <View className="gap-0.5">
                <Text
                    style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: mutedColor,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                    }}
                >
                    Package access
                </Text>
                <Text style={{ fontSize: 12, color: mutedColor, lineHeight: 16 }}>
                    Override what this person can do per package. “Default” inherits from their
                    role.
                </Text>
            </View>

            <View className="rounded-xl overflow-hidden" style={{ borderWidth: 1, borderColor }}>
                {packages.map((pkg, idx) => {
                    const override = overrideMap.get(pkg.slug)
                    const selected: PackageAccessLevel | 'default' = override?.access ?? 'default'
                    return (
                        <View
                            key={pkg.slug}
                            className="flex-row items-center justify-between px-3 py-2.5"
                            style={{
                                borderTopWidth: idx === 0 ? 0 : 1,
                                borderColor,
                            }}
                        >
                            <Text
                                style={{ fontSize: 13, color: fgColor, fontWeight: '500', flex: 1 }}
                                numberOfLines={1}
                            >
                                {pkg.nav?.label ?? pkg.slug}
                            </Text>
                            <View className="flex-row" style={{ gap: 4 }}>
                                {ACCESS_OPTIONS.map(opt => {
                                    const isActive = selected === opt.value
                                    return (
                                        <AccessChip
                                            key={opt.value}
                                            label={opt.label}
                                            active={isActive}
                                            onPress={() => {
                                                if (opt.value === 'default') {
                                                    if (override) {
                                                        clearAccess.mutate({ pkg: pkg.slug })
                                                    }
                                                } else if (!isActive) {
                                                    upsertAccess.mutate({
                                                        pkg: pkg.slug,
                                                        access: opt.value,
                                                    })
                                                }
                                            }}
                                        />
                                    )
                                })}
                            </View>
                        </View>
                    )
                })}
            </View>
        </View>
    )
}

function AccessChip({
    label,
    active,
    onPress,
}: {
    label: string
    active: boolean
    onPress: () => void
}) {
    const primary = useThemeColor('primary')
    const primaryFg = useThemeColor('primary-foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const borderColor = useThemeColor('border')
    return (
        <Pressable
            onPress={onPress}
            style={{
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 6,
                backgroundColor: active ? primary : 'transparent',
                borderWidth: 1,
                borderColor: active ? primary : borderColor,
            }}
        >
            <Text
                style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: active ? primaryFg : mutedColor,
                }}
            >
                {label}
            </Text>
        </Pressable>
    )
}
