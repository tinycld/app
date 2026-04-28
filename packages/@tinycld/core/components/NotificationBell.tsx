import { and, eq } from '@tanstack/db'
import { Bell } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'

export function NotificationBell({ color }: { color: string }) {
    const [notificationsCollection] = useStore('notifications')
    const isOpen = useWorkspaceStore(s => s.isNotificationsOpen)
    const setOpen = useWorkspaceStore(s => s.setNotificationsOpen)

    const { data: unread } = useOrgLiveQuery(
        (query, { orgId }) =>
            query
                .from({ n: notificationsCollection })
                .where(({ n }) => and(eq(n.org, orgId), eq(n.read, false), eq(n.dismissed, false))),
        []
    )

    const unreadCount = unread?.length ?? 0

    return (
        <Pressable
            onPress={() => setOpen(!isOpen)}
            style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                justifyContent: 'center',
                alignItems: 'center',
                position: 'relative',
            }}
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
            <Bell size={22} color={color} />
            <UnreadBadge count={unreadCount} />
        </Pressable>
    )
}

function UnreadBadge({ count }: { count: number }) {
    if (count === 0) return null

    const label = count > 99 ? '99+' : String(count)

    return (
        <View
            style={{
                position: 'absolute',
                top: 4,
                right: 4,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: '#ef4444',
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: 4,
            }}
        >
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{label}</Text>
        </View>
    )
}
