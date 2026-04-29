import { packageSidebars } from '@tinycld/app-generated/package-sidebars'
import { Suspense } from 'react'
import { Platform, View } from 'react-native'
import { usePackage } from '@tinycld/core/lib/packages/use-packages'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { PackageSidebarFallback } from './PackageSidebarFallback'
import { SkeletonSidebar } from './SkeletonLayout'
import { useWorkspaceLayout } from './useWorkspaceLayout'

interface PackageSidebarProps {
    width: number
}

export function PackageSidebar({ width }: PackageSidebarProps) {
    const { activePkgSlug, isSidebarOpen } = useWorkspaceLayout()
    const pkg = usePackage(activePkgSlug ?? '')
    const sidebarBg = useThemeColor('sidebar-background')
    const borderColor = useThemeColor('border')

    if (!pkg) return null

    const SidebarComponent = packageSidebars[pkg.slug]
    const targetWidth = isSidebarOpen ? width : 0

    return (
        <View
            className="overflow-hidden"
            style={[
                {
                    width: targetWidth,
                    backgroundColor: sidebarBg,
                    borderRightColor: borderColor,
                    borderRightWidth: isSidebarOpen ? 1 : 0,
                },
                Platform.OS === 'web'
                    ? ({
                          transition:
                              'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-right-width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      } as object)
                    : undefined,
            ]}
        >
            <View style={{ width, flex: 1, minHeight: 0 }}>
                {SidebarComponent ? (
                    <Suspense fallback={<SkeletonSidebar width={width} />}>
                        <SidebarComponent isCollapsed={false} />
                    </Suspense>
                ) : (
                    <PackageSidebarFallback pkgSlug={pkg.slug} pkgLabel={pkg.nav?.label ?? ''} />
                )}
            </View>
        </View>
    )
}
