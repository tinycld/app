import { asyncStorage, create, persist } from '@tinycld/core/lib/store'

interface DemoLeadState {
    /**
     * Whether this device has ever submitted a demo lead. Persisted so the
     * banner can swap its "Tell us about you" link for a "Thanks!" tag on
     * subsequent visits.
     */
    hasSubmitted: boolean

    /** Transient: is the banner-triggered follow-up modal open right now? */
    isFollowUpOpen: boolean

    setSubmitted: () => void
    setFollowUpOpen: (open: boolean) => void
}

export const useDemoLeadStore = create<DemoLeadState>()(
    persist(
        set => ({
            hasSubmitted: false,
            isFollowUpOpen: false,
            setSubmitted: () => set({ hasSubmitted: true, isFollowUpOpen: false }),
            setFollowUpOpen: open => set({ isFollowUpOpen: open }),
        }),
        {
            name: 'tinycld_demo_lead',
            storage: asyncStorage,
            // Only persist hasSubmitted — isFollowUpOpen is an in-session toggle.
            partialize: s => ({ hasSubmitted: s.hasSubmitted }),
        }
    )
)
