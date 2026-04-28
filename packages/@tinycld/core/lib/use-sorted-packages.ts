import { useMemo } from 'react'
import { useAccessiblePackages } from '@tinycld/core/lib/use-accessible-packages'
import { useUserPreference } from '@tinycld/core/lib/use-user-preference'

export function useSortedPackages() {
    const packages = useAccessiblePackages()
    const [pkgOrder] = useUserPreference('core', 'pkg_order', [] as string[])

    return useMemo(() => {
        if (!pkgOrder.length) {
            return [...packages].sort((a, b) => (a.nav?.order ?? 99) - (b.nav?.order ?? 99))
        }
        const orderMap = new Map(pkgOrder.map((slug, i) => [slug, i]))
        return [...packages].sort((a, b) => {
            const aIdx = orderMap.get(a.slug) ?? 999 + (a.nav?.order ?? 99)
            const bIdx = orderMap.get(b.slug) ?? 999 + (b.nav?.order ?? 99)
            return aIdx - bIdx
        })
    }, [packages, pkgOrder])
}
