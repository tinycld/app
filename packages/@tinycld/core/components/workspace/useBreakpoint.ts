import { useWindowDimensions } from 'react-native'

export type Breakpoint = 'desktop' | 'tablet' | 'mobile'

export function useBreakpoint(): Breakpoint {
    const { width } = useWindowDimensions()
    if (width >= 1024) return 'desktop'
    if (width >= 768) return 'tablet'
    return 'mobile'
}
