import { Sparkles } from 'lucide-react-native'
import { useAuth } from '@tinycld/core/lib/auth'
import {
    FirstRunModal,
    FirstRunModalBullet,
} from '@tinycld/core/components/FirstRunModal'

/**
 * One-shot orientation modal for users entering via /api/demo/start. Renders
 * once per device (tracked via FirstRunModal's AsyncStorage marker) and only
 * for the singleton demo identity (user.isDemo).
 *
 * Pairs with the always-on DemoBanner: this component sets expectations on
 * first arrival; the banner reminds them on every subsequent screen. Together
 * they cover both "what is this?" (modal) and "wait, did my email send?"
 * (banner) confusion modes.
 *
 * Mounted from app/a/[orgSlug]/_layout.tsx so it appears on the first demo
 * screen regardless of which package the user lands in (mail, calendar, etc.).
 */
export function DemoIntroModal() {
    const { user, isLoggedIn, isInitializing } = useAuth({ throwIfAnon: false })

    const enabled = !isInitializing && isLoggedIn && !!user?.isDemo

    return (
        <FirstRunModal
            storageKey="demoIntro"
            enabled={enabled}
            icon={Sparkles}
            accentToken="warning"
            title="You're in the demo workspace"
            intro="Poke around freely — this account is shared, sandboxed, and rebuilt nightly."
            primaryLabel="Got it, let me explore"
            onPrimary={() => {}}
        >
            <FirstRunModalBullet
                label="No real signup"
                detail="Anyone clicking the demo button shares this same account. Don't store anything you wouldn't post on a billboard."
            />
            <FirstRunModalBullet
                label="Outbound email is simulated"
                detail="Sending mail, invites, and shares all complete in the UI but never reach the wire. Useful for trying flows; useless for actual delivery."
            />
            <FirstRunModalBullet
                label="Resets every night"
                detail="At 03:00 UTC the demo workspace is wiped to a clean slate. Anything you create today is gone tomorrow morning."
            />
        </FirstRunModal>
    )
}
