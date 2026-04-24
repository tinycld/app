import { and, eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useCurrentRole } from '@tinycld/core/lib/use-current-role'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useRouter } from 'expo-router'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

const ACTION_OPTIONS = [
    { label: 'All', value: '' },
    { label: 'Created', value: 'created' },
    { label: 'Updated', value: 'updated' },
    { label: 'Deleted', value: 'deleted' },
] as const

const RESOURCE_TYPE_OPTIONS = [
    { label: 'All', value: '' },
    { label: 'Contacts', value: 'contacts' },
    { label: 'Calendar', value: 'calendar_events' },
    { label: 'Calendars', value: 'calendar_calendars' },
    { label: 'Drive', value: 'drive_items' },
    { label: 'Mail', value: 'mail_messages' },
    { label: 'Mailboxes', value: 'mail_mailboxes' },
    { label: 'Domains', value: 'mail_domains' },
    { label: 'Members', value: 'user_org' },
    { label: 'Labels', value: 'labels' },
    { label: 'Settings', value: 'settings' },
    { label: 'Packages', value: 'org_pkg_enabled' },
] as const

const ACTION_BADGE_COLORS = {
    created: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
    updated: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },
    deleted: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
} as const

export default function AuditLogSettings() {
    const router = useRouter()
    const { isAdmin } = useCurrentRole()
    const [actionFilter, setActionFilter] = useState('')
    const [resourceFilter, setResourceFilter] = useState('')

    const fgColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const bgColor = useThemeColor('background')

    if (!isAdmin) {
        return (
            <View
                className="flex-1 p-5 items-center justify-center"
                style={{ backgroundColor: bgColor }}
            >
                <Text style={{ fontSize: 16, color: mutedColor }}>
                    Only admins can view audit logs.
                </Text>
            </View>
        )
    }

    return (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={{ backgroundColor: bgColor }}>
            <View className="flex-1 p-5 max-w-[700px]">
                <View className="flex-row gap-3 items-center mb-5">
                    <Pressable onPress={() => router.back()}>
                        <ArrowLeft size={24} color={fgColor} />
                    </Pressable>
                    <Text style={{ fontSize: 22, fontWeight: 'bold', color: fgColor }}>
                        Audit Log
                    </Text>
                </View>

                <FilterBar
                    actionFilter={actionFilter}
                    onActionChange={setActionFilter}
                    resourceFilter={resourceFilter}
                    onResourceChange={setResourceFilter}
                />

                <AuditLogList actionFilter={actionFilter} resourceFilter={resourceFilter} />
            </View>
        </ScrollView>
    )
}

function FilterBar({
    actionFilter,
    onActionChange,
    resourceFilter,
    onResourceChange,
}: {
    actionFilter: string
    onActionChange: (v: string) => void
    resourceFilter: string
    onResourceChange: (v: string) => void
}) {
    const primaryColor = useThemeColor('primary')
    const primaryFgColor = useThemeColor('primary-foreground')
    const borderColor = useThemeColor('border')

    return (
        <View className="mb-4 gap-3">
            <View className="gap-1.5">
                <FilterLabel text="Action" />
                <View className="flex-row gap-1.5 flex-wrap">
                    {ACTION_OPTIONS.map(opt => (
                        <FilterChip
                            key={opt.value}
                            label={opt.label}
                            isActive={actionFilter === opt.value}
                            onPress={() => onActionChange(opt.value)}
                            activeColor={primaryColor}
                            activeFgColor={primaryFgColor}
                            borderColor={borderColor}
                        />
                    ))}
                </View>
            </View>
            <View className="gap-1.5">
                <FilterLabel text="Resource" />
                <View className="flex-row gap-1.5 flex-wrap">
                    {RESOURCE_TYPE_OPTIONS.map(opt => (
                        <FilterChip
                            key={opt.value}
                            label={opt.label}
                            isActive={resourceFilter === opt.value}
                            onPress={() => onResourceChange(opt.value)}
                            activeColor={primaryColor}
                            activeFgColor={primaryFgColor}
                            borderColor={borderColor}
                        />
                    ))}
                </View>
            </View>
        </View>
    )
}

function FilterLabel({ text }: { text: string }) {
    const mutedColor = useThemeColor('muted-foreground')
    return <Text style={{ fontSize: 12, fontWeight: '600', color: mutedColor }}>{text}</Text>
}

function FilterChip({
    label,
    isActive,
    onPress,
    activeColor,
    activeFgColor,
    borderColor,
}: {
    label: string
    isActive: boolean
    onPress: () => void
    activeColor: string
    activeFgColor: string
    borderColor: string
}) {
    return (
        <Pressable
            onPress={onPress}
            className="px-2.5 py-1 rounded-md"
            style={{
                backgroundColor: isActive ? activeColor : 'transparent',
                borderWidth: isActive ? 0 : 1,
                borderColor,
            }}
        >
            <Text
                style={{
                    fontSize: 12,
                    color: isActive ? activeFgColor : activeColor,
                }}
            >
                {label}
            </Text>
        </Pressable>
    )
}

function AuditLogList({
    actionFilter,
    resourceFilter,
}: {
    actionFilter: string
    resourceFilter: string
}) {
    const [auditLogsCollection] = useStore('audit_logs')

    const { data: logs } = useOrgLiveQuery(
        (query, { orgId }) => {
            const q = query
                .from({ audit_logs: auditLogsCollection })
                .where(({ audit_logs }) => {
                    let condition = eq(audit_logs.org, orgId)
                    if (actionFilter) {
                        condition = and(condition, eq(audit_logs.action, actionFilter))
                    }
                    if (resourceFilter) {
                        condition = and(condition, eq(audit_logs.resource_type, resourceFilter))
                    }
                    return condition
                })
                .orderBy(({ audit_logs }) => audit_logs.created, 'desc')

            return q
        },
        [actionFilter, resourceFilter]
    )

    const mutedColor = useThemeColor('muted-foreground')
    const surfaceBg = useThemeColor('surface-secondary')
    const borderColor = useThemeColor('border')

    if (!logs || logs.length === 0) {
        return (
            <Text style={{ fontSize: 14, color: mutedColor, marginTop: 8 }}>
                No audit log entries found.
            </Text>
        )
    }

    return (
        <View
            className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: surfaceBg, borderColor }}
        >
            {logs.map(entry => (
                <AuditLogRow key={entry.id} entry={entry} />
            ))}
        </View>
    )
}

interface AuditEntry {
    id: string
    action: 'created' | 'updated' | 'deleted'
    resource_type: string
    resource_id: string
    resource_label: string
    changes: Record<string, { before?: unknown; after?: unknown; redacted?: boolean }> | null
    snapshot: Record<string, unknown> | null
    created: string
    expand?: { actor?: { name: string; email: string } }
}

function AuditLogRow({ entry }: { entry: AuditEntry }) {
    const [expanded, setExpanded] = useState(false)
    const fgColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const borderColor = useThemeColor('border')

    const actorName = entry.expand?.actor?.name || entry.expand?.actor?.email || 'System'
    const actionColors = ACTION_BADGE_COLORS[entry.action as keyof typeof ACTION_BADGE_COLORS]
    const hasDetails = Boolean(
        (entry.action === 'updated' && entry.changes && Object.keys(entry.changes).length > 0) ||
            (entry.action === 'deleted' && entry.snapshot && Object.keys(entry.snapshot).length > 0)
    )

    const resourceLabel = formatResourceType(entry.resource_type)

    return (
        <View style={{ borderBottomWidth: 1, borderBottomColor: borderColor }}>
            <Pressable
                className="px-4 py-3 flex-row items-center gap-3"
                onPress={() => hasDetails && setExpanded(!expanded)}
            >
                <View className="flex-1 gap-1">
                    <View className="flex-row gap-2 items-center flex-wrap">
                        <Text style={{ fontSize: 14, fontWeight: '600', color: fgColor }}>
                            {actorName}
                        </Text>
                        <ActionBadge action={entry.action} colors={actionColors} />
                        <Text style={{ fontSize: 13, color: mutedColor }}>{resourceLabel}</Text>
                    </View>
                    <EntryLabel isVisible={!!entry.resource_label} label={entry.resource_label} />
                    <Text style={{ fontSize: 12, color: mutedColor }}>
                        {formatRelativeTime(entry.created)}
                    </Text>
                </View>
                <ExpandIcon isVisible={hasDetails} expanded={expanded} color={mutedColor} />
            </Pressable>

            <AuditDetails
                isVisible={expanded}
                action={entry.action}
                changes={entry.changes}
                snapshot={entry.snapshot}
            />
        </View>
    )
}

function EntryLabel({ isVisible, label }: { isVisible: boolean; label: string }) {
    const fgColor = useThemeColor('foreground')
    if (!isVisible) return null
    return <Text style={{ fontSize: 13, color: fgColor }}>{label}</Text>
}

function ExpandIcon({
    isVisible,
    expanded,
    color,
}: {
    isVisible: boolean
    expanded: boolean
    color: string
}) {
    if (!isVisible) return null
    return expanded ? (
        <ChevronUp size={16} color={color} />
    ) : (
        <ChevronDown size={16} color={color} />
    )
}

function ActionBadge({ action, colors }: { action: string; colors: { bg: string; text: string } }) {
    return (
        <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: colors.bg }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text }}>{action}</Text>
        </View>
    )
}

function AuditDetails({
    isVisible,
    action,
    changes,
    snapshot,
}: {
    isVisible: boolean
    action: string
    changes: Record<string, { before?: unknown; after?: unknown; redacted?: boolean }> | null
    snapshot: Record<string, unknown> | null
}) {
    const fgColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const surfaceBg = useThemeColor('surface-secondary')

    if (!isVisible) return null

    if (action === 'updated' && changes) {
        return (
            <View className="px-4 pb-3 gap-1.5">
                {Object.entries(changes).map(([field, change]) => (
                    <View
                        key={field}
                        className="rounded-md p-2"
                        style={{ backgroundColor: surfaceBg }}
                    >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: fgColor }}>
                            {field}
                        </Text>
                        <ChangeDetail isVisible={!change.redacted} change={change} />
                        <RedactedLabel isVisible={!!change.redacted} />
                    </View>
                ))}
            </View>
        )
    }

    if (action === 'deleted' && snapshot) {
        return (
            <View className="px-4 pb-3 gap-1.5">
                {Object.entries(snapshot).map(([field, value]) => (
                    <View key={field} className="flex-row gap-2">
                        <Text style={{ fontSize: 12, fontWeight: '600', color: mutedColor }}>
                            {field}:
                        </Text>
                        <Text className="flex-1" style={{ fontSize: 12, color: fgColor }}>
                            {formatValue(value)}
                        </Text>
                    </View>
                ))}
            </View>
        )
    }

    return null
}

function ChangeDetail({
    isVisible,
    change,
}: {
    isVisible: boolean
    change: { before?: unknown; after?: unknown }
}) {
    const dangerColor = useThemeColor('danger')
    const successColor = '#22c55e'

    if (!isVisible) return null

    return (
        <View className="gap-0.5 mt-1">
            <Text style={{ fontSize: 11, color: dangerColor }}>- {formatValue(change.before)}</Text>
            <Text style={{ fontSize: 11, color: successColor }}>+ {formatValue(change.after)}</Text>
        </View>
    )
}

function RedactedLabel({ isVisible }: { isVisible: boolean }) {
    const mutedColor = useThemeColor('muted-foreground')
    if (!isVisible) return null
    return <Text style={{ fontSize: 11, fontStyle: 'italic', color: mutedColor }}>[redacted]</Text>
}

function formatResourceType(resourceType: string): string {
    return resourceType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatValue(val: unknown): string {
    if (val === null || val === undefined) return '(empty)'
    if (typeof val === 'object') return JSON.stringify(val)
    return String(val)
}

function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr.replace(' ', 'T'))
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)

    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    const diffDay = Math.floor(diffHr / 24)
    if (diffDay < 30) return `${diffDay}d ago`
    return date.toLocaleDateString()
}
