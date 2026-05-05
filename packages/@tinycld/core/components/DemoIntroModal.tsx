import { Sparkles } from 'lucide-react-native'
import { useRef } from 'react'
import { useAuth } from '@tinycld/core/lib/auth'
import {
    DemoLeadForm,
    type DemoLeadFormHandle,
} from '@tinycld/core/components/DemoLeadForm'
import { FirstRunModal } from '@tinycld/core/components/FirstRunModal'
import { useDemoLeadStore } from '@tinycld/core/lib/stores/demo-lead-store'

/**
 * One-shot orientation modal for users entering via /api/demo/start. Renders
 * once per device (tracked via FirstRunModal's AsyncStorage marker) and only
 * for the singleton demo identity (user.isDemo).
 *
 * Pairs with the always-on DemoBanner: the modal asks for an email + reason
 * on first arrival; the banner reminds users they're in demo mode and
 * exposes a deferred "Tell us about you" link for visitors who skipped.
 *
 * Mounted from app/a/[orgSlug]/_layout.tsx so it appears on the first demo
 * screen regardless of which package the user lands in (mail, calendar, etc.).
 */
export function DemoIntroModal() {
    const { user, isLoggedIn, isInitializing } = useAuth({ throwIfAnon: false })
    const formRef = useRef<DemoLeadFormHandle>(null)

    const enabled = !isInitializing && isLoggedIn && !!user?.isDemo

    const handlePrimary = (): boolean => {
        const ok = formRef.current?.submit() ?? false
        if (ok) {
            useDemoLeadStore.getState().setSubmitted()
        }
        return ok
    }

    const handleSkip = () => {
        // Skipping leaves hasSubmitted=false so the banner link stays visible.
        // The FirstRunModal storage marker still fires from the dismiss path,
        // so this modal won't reappear on the same device.
    }

    return (
        <FirstRunModal
            storageKey="demoIntro"
            enabled={enabled}
            icon={Sparkles}
            accentToken="warning"
            title="You're in the demo workspace"
            intro="Poke around freely — this is shared, sandboxed, and resets nightly. If you'd like us to follow up, drop your email."
            primaryLabel="Submit and explore"
            onPrimary={handlePrimary}
            secondaryLabel="Skip for now"
            onSecondary={handleSkip}
        >
            <DemoLeadForm ref={formRef} source="intro_modal" />
        </FirstRunModal>
    )
}
