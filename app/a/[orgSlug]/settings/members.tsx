import { eq } from '@tanstack/db'
import { MemberAvatar } from '@tinycld/core/components/settings/members/MemberAvatar'
import {
    PendingBadge,
    RoleBadge,
    YouBadge,
} from '@tinycld/core/components/settings/members/MemberBadges'
import { MembersDrawer } from '@tinycld/core/components/settings/members/MembersDrawer'
import {
    type DrawerMode,
    type MemberRow,
    type OrgRole,
    ROLE_LABELS,
    ROLE_ORDER,
} from '@tinycld/core/components/settings/members/types'
import { useAuth } from '@tinycld/core/lib/auth'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useCurrentRole } from '@tinycld/core/lib/use-current-role'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useRouter } from 'expo-router'
import { ArrowLeft, ChevronRight, Search, UserPlus, Users } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'

export default function MembersSettings() {
    const router = useRouter()
    const { isAdmin, isOwner } = useCurrentRole()
    const { user } = useAuth()
    const [userOrgCollection, usersCollection] = useStore('user_org', 'users')

    const fgColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const bgColor = useThemeColor('background')
    const borderColor = useThemeColor('border')
    const primaryColor = useThemeColor('primary')
    const primaryFgColor = useThemeColor('primary-foreground')
    const surfaceBg = useThemeColor('surface-secondary')

    const { data: memberRows } = useOrgLiveQuery((query, { orgId }) =>
        query
            .from({ uo: userOrgCollection })
            .join({ u: usersCollection }, ({ uo, u }) => eq(uo.user, u.id))
            .where(({ uo }) => eq(uo.org, orgId))
            .select(({ uo, u }) => ({
                userOrgId: uo.id,
                userId: uo.user,
                name: u.name,
                email: u.email,
                role: uo.role,
                verified: u.verified,
            }))
    )

    const members: MemberRow[] = useMemo(
        () =>
            (memberRows ?? []).map(row => ({
                userOrgId: row.userOrgId,
                userId: row.userId,
                name: row.name ?? '',
                email: row.email ?? '',
                role: row.role as OrgRole,
                isPending: row.verified === false,
            })),
        [memberRows]
    )

    const [query, setQuery] = useState('')
    const [roleFilter, setRoleFilter] = useState<OrgRole | 'all'>('all')
    const [drawerMode, setDrawerMode] = useState<DrawerMode>({ kind: 'closed' })

    const { filtered, groups, counts, pendingCount } = useMemo(() => {
        const q = query.trim().toLowerCase()
        const matches = (m: MemberRow) =>
            !q ||
            m.name.toLowerCase().includes(q) ||
            m.email.toLowerCase().includes(q) ||
            m.role.toLowerCase().includes(q)

        const counts: Record<OrgRole | 'all', number> = {
            all: members.length,
            owner: 0,
            admin: 0,
            member: 0,
            guest: 0,
        }
        for (const m of members) counts[m.role] += 1
        const pendingCount = members.filter(m => m.isPending).length

        const filtered = members.filter(
            m => matches(m) && (roleFilter === 'all' || m.role === roleFilter)
        )

        const groups: Record<OrgRole, MemberRow[]> = {
            owner: [],
            admin: [],
            member: [],
            guest: [],
        }
        for (const m of filtered) groups[m.role].push(m)
        for (const role of ROLE_ORDER) {
            groups[role].sort((a, b) => {
                const aSelf = a.userId === user.id ? 0 : 1
                const bSelf = b.userId === user.id ? 0 : 1
                if (aSelf !== bSelf) return aSelf - bSelf
                const aName = (a.name || a.email).toLowerCase()
                const bName = (b.name || b.email).toLowerCase()
                return aName.localeCompare(bName)
            })
        }

        return { filtered, groups, counts, pendingCount }
    }, [members, query, roleFilter, user.id])

    if (!isAdmin) {
        return (
            <View
                className="flex-1 items-center justify-center p-5"
                style={{ backgroundColor: bgColor }}
            >
                <View
                    className="items-center gap-3 rounded-xl"
                    style={{
                        paddingVertical: 32,
                        paddingHorizontal: 24,
                        backgroundColor: surfaceBg,
                        borderWidth: 1,
                        borderColor,
                    }}
                >
                    <Users size={28} color={mutedColor} />
                    <Text style={{ fontSize: 15, color: fgColor, fontWeight: '600' }}>
                        Admin access required
                    </Text>
                    <Text style={{ fontSize: 13, color: mutedColor, textAlign: 'center' }}>
                        Only admins and owners can manage organization members.
                    </Text>
                </View>
            </View>
        )
    }

    const filterChips: Array<{ key: OrgRole | 'all'; label: string; count: number }> = [
        { key: 'all', label: 'All', count: counts.all },
        ...ROLE_ORDER.filter(r => counts[r] > 0).map(r => ({
            key: r,
            label: ROLE_LABELS[r],
            count: counts[r],
        })),
    ]

    return (
        <>
            <ScrollView
                contentContainerStyle={{ flexGrow: 1 }}
                style={{ backgroundColor: bgColor }}
            >
                <View className="flex-1 gap-6 p-5" style={{ maxWidth: 820 }}>
                    <View className="flex-row items-center gap-3">
                        <Pressable
                            onPress={() => router.back()}
                            hitSlop={12}
                            className="rounded-full"
                            style={{ padding: 6 }}
                        >
                            <ArrowLeft size={22} color={fgColor} />
                        </Pressable>
                        <View className="flex-1 gap-0.5">
                            <Text style={{ fontSize: 11, color: mutedColor, letterSpacing: 0.6 }}>
                                Settings
                            </Text>
                            <Text style={{ fontSize: 24, fontWeight: '800', color: fgColor }}>
                                Members
                            </Text>
                        </View>
                        <Pressable
                            onPress={() => setDrawerMode({ kind: 'invite' })}
                            className="flex-row items-center gap-1.5 rounded-lg"
                            style={{
                                paddingVertical: 9,
                                paddingHorizontal: 14,
                                backgroundColor: primaryColor,
                            }}
                        >
                            <UserPlus size={14} color={primaryFgColor} />
                            <Text
                                style={{
                                    fontSize: 13,
                                    fontWeight: '700',
                                    color: primaryFgColor,
                                }}
                            >
                                Invite
                            </Text>
                        </Pressable>
                    </View>

                    <View className="flex-row items-center gap-3 flex-wrap">
                        <StatChip label="Total" value={counts.all} tone="neutral" />
                        <StatChip
                            label="Pending"
                            value={pendingCount}
                            tone={pendingCount > 0 ? 'warn' : 'neutral'}
                            dim={pendingCount === 0}
                        />
                        {counts.owner > 0 && (
                            <StatChip label="Owners" value={counts.owner} tone="owner" />
                        )}
                    </View>

                    <View className="gap-3">
                        <View
                            className="flex-row items-center gap-2 rounded-xl"
                            style={{
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderWidth: 1,
                                borderColor,
                                backgroundColor: surfaceBg,
                            }}
                        >
                            <Search size={15} color={mutedColor} />
                            <TextInput
                                value={query}
                                onChangeText={setQuery}
                                placeholder="Search by name, email, or role"
                                placeholderTextColor={mutedColor}
                                autoCapitalize="none"
                                autoCorrect={false}
                                style={{
                                    flex: 1,
                                    color: fgColor,
                                    fontSize: 14,
                                    paddingVertical: 2,
                                }}
                            />
                        </View>

                        <View className="flex-row gap-1.5 flex-wrap">
                            {filterChips.map(chip => (
                                <FilterChip
                                    key={chip.key}
                                    label={chip.label}
                                    count={chip.count}
                                    active={roleFilter === chip.key}
                                    onPress={() => setRoleFilter(chip.key)}
                                />
                            ))}
                        </View>
                    </View>

                    {filtered.length === 0 ? (
                        <EmptyState
                            query={query}
                            onClear={() => {
                                setQuery('')
                                setRoleFilter('all')
                            }}
                        />
                    ) : (
                        <View className="gap-4">
                            {ROLE_ORDER.map(role =>
                                groups[role].length > 0 ? (
                                    <MemberGroup
                                        key={role}
                                        role={role}
                                        rows={groups[role]}
                                        onSelect={m =>
                                            setDrawerMode({
                                                kind: 'view',
                                                userOrgId: m.userOrgId,
                                            })
                                        }
                                    />
                                ) : null
                            )}
                        </View>
                    )}
                </View>
            </ScrollView>

            <MembersDrawer
                mode={drawerMode}
                onClose={() => setDrawerMode({ kind: 'closed' })}
                members={members}
                isCurrentUserOwner={isOwner}
            />
        </>
    )
}

function MemberGroup({
    role,
    rows,
    onSelect,
}: {
    role: OrgRole
    rows: MemberRow[]
    onSelect: (member: MemberRow) => void
}) {
    const mutedColor = useThemeColor('muted-foreground')
    const borderColor = useThemeColor('border')
    const surfaceBg = useThemeColor('surface-secondary')

    return (
        <View className="gap-2">
            <View className="flex-row items-center gap-2" style={{ paddingHorizontal: 2 }}>
                <Text
                    style={{
                        fontSize: 10.5,
                        fontWeight: '800',
                        color: mutedColor,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                    }}
                >
                    {ROLE_LABELS[role]}
                    {rows.length === 1 ? '' : 's'}
                </Text>
                <View
                    style={{
                        paddingVertical: 1,
                        paddingHorizontal: 6,
                        borderRadius: 999,
                        backgroundColor: `${mutedColor}1F`,
                    }}
                >
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: mutedColor }}>
                        {rows.length}
                    </Text>
                </View>
            </View>

            <View
                className="rounded-xl overflow-hidden"
                style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
            >
                {rows.map((member, idx) => (
                    <MemberRowItem
                        key={member.userOrgId}
                        member={member}
                        isFirst={idx === 0}
                        onPress={() => onSelect(member)}
                    />
                ))}
            </View>
        </View>
    )
}

function MemberRowItem({
    member,
    isFirst,
    onPress,
}: {
    member: MemberRow
    isFirst: boolean
    onPress: () => void
}) {
    const { user } = useAuth()
    const fgColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const borderColor = useThemeColor('border')

    const isSelf = member.userId === user.id
    const displayName = member.name || member.email.split('@')[0] || member.email

    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center gap-3"
            style={{
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderTopWidth: isFirst ? 0 : 1,
                borderColor,
            }}
        >
            <MemberAvatar
                name={member.name}
                email={member.email}
                size={38}
                dimmed={member.isPending}
            />

            <View className="flex-1" style={{ minWidth: 0 }}>
                <View className="flex-row items-center gap-1.5" style={{ flexWrap: 'wrap' }}>
                    <Text
                        style={{ fontSize: 14, fontWeight: '600', color: fgColor }}
                        numberOfLines={1}
                    >
                        {displayName}
                    </Text>
                    {isSelf && <YouBadge />}
                </View>
                <Text style={{ fontSize: 12.5, color: mutedColor }} numberOfLines={1}>
                    {member.email}
                </Text>
            </View>

            <View className="flex-row items-center gap-1.5">
                {member.isPending && <PendingBadge />}
                <RoleBadge role={member.role} size="sm" />
            </View>

            <ChevronRight size={15} color={mutedColor} />
        </Pressable>
    )
}

function FilterChip({
    label,
    count,
    active,
    onPress,
}: {
    label: string
    count: number
    active: boolean
    onPress: () => void
}) {
    const fgColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const borderColor = useThemeColor('border')
    const surfaceBg = useThemeColor('surface-secondary')

    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center gap-1.5 rounded-full"
            style={{
                paddingVertical: 5,
                paddingHorizontal: 11,
                borderWidth: 1,
                borderColor: active ? fgColor : borderColor,
                backgroundColor: active ? fgColor : surfaceBg,
            }}
        >
            <Text
                style={{
                    fontSize: 12.5,
                    fontWeight: '600',
                    color: active ? surfaceBg : fgColor,
                }}
            >
                {label}
            </Text>
            <Text
                style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: active ? surfaceBg : mutedColor,
                }}
            >
                {count}
            </Text>
        </Pressable>
    )
}

function StatChip({
    label,
    value,
    tone,
    dim,
}: {
    label: string
    value: number
    tone: 'neutral' | 'warn' | 'owner'
    dim?: boolean
}) {
    const fgColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const borderColor = useThemeColor('border')

    const tones = {
        neutral: { fg: fgColor, accent: mutedColor, ring: borderColor },
        warn: { fg: '#b45309', accent: '#b45309', ring: 'rgba(180, 83, 9, 0.35)' },
        owner: { fg: '#7c3aed', accent: '#7c3aed', ring: 'rgba(124, 58, 237, 0.35)' },
    }[tone]

    return (
        <View
            className="flex-row items-baseline gap-1.5 rounded-lg"
            style={{
                paddingVertical: 6,
                paddingHorizontal: 11,
                borderWidth: 1,
                borderColor: tones.ring,
                opacity: dim ? 0.5 : 1,
            }}
        >
            <Text style={{ fontSize: 15, fontWeight: '800', color: tones.accent }}>{value}</Text>
            <Text
                style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: tones.fg,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                }}
            >
                {label}
            </Text>
        </View>
    )
}

function EmptyState({ query, onClear }: { query: string; onClear: () => void }) {
    const fgColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const borderColor = useThemeColor('border')
    const surfaceBg = useThemeColor('surface-secondary')
    const primaryColor = useThemeColor('primary')

    const isSearching = query.trim().length > 0

    return (
        <View
            className="items-center gap-3 rounded-xl"
            style={{
                paddingVertical: 32,
                paddingHorizontal: 24,
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor,
                borderStyle: 'dashed',
            }}
        >
            <View
                className="items-center justify-center rounded-full"
                style={{
                    width: 44,
                    height: 44,
                    backgroundColor: `${primaryColor}14`,
                }}
            >
                <Users size={20} color={primaryColor} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: fgColor }}>
                {isSearching ? 'No members match that search' : 'No members yet'}
            </Text>
            <Text style={{ fontSize: 12.5, color: mutedColor, textAlign: 'center' }}>
                {isSearching
                    ? 'Try a different name, email, or clear the filters.'
                    : 'Invite your first teammate to get started.'}
            </Text>
            {isSearching && (
                <Pressable onPress={onClear}>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: primaryColor }}>
                        Clear filters
                    </Text>
                </Pressable>
            )}
        </View>
    )
}
