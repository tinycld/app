import { DemoIntroModal } from '@tinycld/core/components/DemoIntroModal'
import { NotifyContextSync } from '@tinycld/core/components/NotifyContextSync'
import { AuthGate } from '@tinycld/core/components/workspace/AuthGate'
import { ImportNotifier } from '@tinycld/core/components/workspace/ImportNotifier'
import { SkeletonLayout } from '@tinycld/core/components/workspace/SkeletonLayout'
import { WorkspaceLayout } from '@tinycld/core/components/workspace/WorkspaceLayout'
import { useAuth } from '@tinycld/core/lib/auth'
import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'
import { OrgSlugProvider } from '@tinycld/core/lib/use-org-slug'
import { useGlobalSearchParams, usePathname } from 'expo-router'
import { useEffect } from 'react'
import { Platform, View } from 'react-native'

export default function OrgLayout() {
    const { orgSlug = '' } = useGlobalSearchParams<{ orgSlug: string }>()

    return (
        <OrgSlugProvider slug={orgSlug}>
            <OrgLayoutInner />
        </OrgSlugProvider>
    )
}

function OrgLayoutInner() {
    const auth = useAuth({ throwIfAnon: false })
    const isReady = !auth.isInitializing && auth.isLoggedIn

    return (
        <>
            <ActivePkgSync />
            <ImportNotifier />
            <NotifyContextSync />
            <WorkspaceLayout isReady={isReady} />
            <DemoIntroModal />
            {!isReady && (
                <View
                    style={[
                        {
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 10,
                        },
                        Platform.OS === 'web' ? ({ height: '100vh' } as object) : undefined,
                    ]}
                >
                    <SkeletonLayout />
                    {!auth.isInitializing && !auth.isLoggedIn && <AuthGate />}
                </View>
            )}
        </>
    )
}

function ActivePkgSync() {
    const pathname = usePathname()
    const setActivePkgSlug = useWorkspaceStore(s => s.setActivePkgSlug)
    const setDrawerOpen = useWorkspaceStore(s => s.setDrawerOpen)

    useEffect(() => {
        setDrawerOpen(false)

        const match = pathname.match(/^\/a\/[^/]+\/([^/?]+)/)
        const slug = match?.[1] ?? null
        setActivePkgSlug(slug === 'settings' ? null : slug)
    }, [pathname, setActivePkgSlug, setDrawerOpen])

    return null
}
