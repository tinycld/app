import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@react-native-async-storage/async-storage', () => {
    const store = new Map<string, string>()
    return {
        default: {
            getItem: vi.fn(async (k: string) => store.get(k) ?? null),
            setItem: vi.fn(async (k: string, v: string) => {
                store.set(k, v)
            }),
            removeItem: vi.fn(async (k: string) => {
                store.delete(k)
            }),
            __reset: () => store.clear(),
        },
    }
})

describe('useDemoLeadStore', () => {
    beforeEach(async () => {
        vi.resetModules()
        const mod = await import('@react-native-async-storage/async-storage')
        ;(mod.default as unknown as { __reset: () => void }).__reset()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('starts with hasSubmitted=false and isFollowUpOpen=false', async () => {
        const { useDemoLeadStore } = await import(
            '@tinycld/core/lib/stores/demo-lead-store'
        )
        const state = useDemoLeadStore.getState()
        expect(state.hasSubmitted).toBe(false)
        expect(state.isFollowUpOpen).toBe(false)
    })

    it('setSubmitted flips hasSubmitted true and closes the follow-up modal', async () => {
        const { useDemoLeadStore } = await import(
            '@tinycld/core/lib/stores/demo-lead-store'
        )
        useDemoLeadStore.getState().setFollowUpOpen(true)
        useDemoLeadStore.getState().setSubmitted()

        const state = useDemoLeadStore.getState()
        expect(state.hasSubmitted).toBe(true)
        expect(state.isFollowUpOpen).toBe(false)
    })

    it('setFollowUpOpen toggles the transient field independently', async () => {
        const { useDemoLeadStore } = await import(
            '@tinycld/core/lib/stores/demo-lead-store'
        )
        useDemoLeadStore.getState().setFollowUpOpen(true)
        expect(useDemoLeadStore.getState().isFollowUpOpen).toBe(true)
        expect(useDemoLeadStore.getState().hasSubmitted).toBe(false)

        useDemoLeadStore.getState().setFollowUpOpen(false)
        expect(useDemoLeadStore.getState().isFollowUpOpen).toBe(false)
    })
})
