import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'
import { useBreakpoint } from './useBreakpoint'

export function useWorkspaceLayout() {
    const store = useWorkspaceStore()
    const breakpoint = useBreakpoint()
    return { ...store, breakpoint }
}
