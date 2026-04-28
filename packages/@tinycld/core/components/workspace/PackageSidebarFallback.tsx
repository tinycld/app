import { useRouter } from 'expo-router'
import { Home } from 'lucide-react-native'
import { SidebarItem, SidebarNav } from '@tinycld/core/components/sidebar-primitives'
import { useOrgSlug } from '@tinycld/core/lib/use-org-slug'

interface PackageSidebarFallbackProps {
    pkgSlug: string
    pkgLabel: string
}

export function PackageSidebarFallback({ pkgSlug, pkgLabel }: PackageSidebarFallbackProps) {
    const router = useRouter()
    const orgSlug = useOrgSlug()

    return (
        <SidebarNav>
            <SidebarItem
                label={pkgLabel}
                icon={Home}
                isActive
                onPress={() => router.push(`/a/${orgSlug}/${pkgSlug}`)}
            />
        </SidebarNav>
    )
}
