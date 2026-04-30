import AsyncStorage from '@react-native-async-storage/async-storage'
import type { LucideIcon } from 'lucide-react-native'
import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'

/**
 * Headline + body shell for one-shot first-run education modals.
 *
 * Persists a "shown" marker under `firstRun:{storageKey}` in AsyncStorage so
 * a given user only sees a modal once per device. Callers compose the
 * surrounding gating predicate (e.g. "fire when user is demo AND on /a/demo")
 * — this component only handles the dismiss-and-remember side. Two callers
 * exist today (DemoIntroModal, planned WelcomeModal); copy is provided per
 * caller, layout/style is shared.
 *
 * Pass `enabled={false}` to suppress the modal entirely (e.g. while auth is
 * still loading) — it'll wait for the gate to flip true before ever showing
 * itself, so we don't flash unrelated modals during the boot sequence.
 */
export interface FirstRunModalProps {
    /**
     * Stable per-modal key. The full AsyncStorage key is namespaced
     * (`firstRun:` prefix) so callers don't collide with unrelated state.
     */
    storageKey: string
    /** Predicate gating whether the modal should consider showing. */
    enabled: boolean
    icon: LucideIcon
    /** Tone of the icon + accent edge. Maps to a useThemeColor token. */
    accentToken?: 'primary' | 'warning' | 'success'
    title: string
    /** Single short paragraph below the title — keep under ~140 chars. */
    intro: string
    /** Body slot — typically a list of <FirstRunModalBullet /> children. */
    children?: ReactNode
    primaryLabel: string
    onPrimary: () => void
    /**
     * Optional secondary action. When omitted, the modal renders the primary
     * button alone — useful for "got it" confirmations where there's nothing
     * meaningful to choose between.
     */
    secondaryLabel?: string
    onSecondary?: () => void
}

const STORAGE_NAMESPACE = 'firstRun:'

export function FirstRunModal({
    storageKey,
    enabled,
    icon: Icon,
    accentToken = 'primary',
    title,
    intro,
    children,
    primaryLabel,
    onPrimary,
    secondaryLabel,
    onSecondary,
}: FirstRunModalProps) {
    const [phase, setPhase] = useState<'pending' | 'show' | 'hide'>('pending')

    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')
    const bg = useThemeColor('background')
    const border = useThemeColor('border')
    const backdrop = useThemeColor('overlay-backdrop')
    const accent = useThemeColor(accentToken)
    const accentFg = useThemeColor(`${accentToken}-foreground` as 'primary-foreground')

    useEffect(() => {
        if (!enabled) return
        let cancelled = false
        AsyncStorage.getItem(STORAGE_NAMESPACE + storageKey)
            .then(value => {
                if (cancelled) return
                setPhase(value === '1' ? 'hide' : 'show')
            })
            .catch(() => {
                // Storage failures default to "don't show": worst case the
                // user misses an intro modal, which is recoverable; the
                // alternative (showing every visit) is more annoying.
                if (!cancelled) setPhase('hide')
            })
        return () => {
            cancelled = true
        }
    }, [enabled, storageKey])

    if (phase !== 'show') return null

    const dismiss = (action: 'primary' | 'secondary') => {
        AsyncStorage.setItem(STORAGE_NAMESPACE + storageKey, '1').catch(() => {
            // If we can't persist the marker the modal will reappear next
            // boot. Annoying but not broken; nothing to do at the call site.
        })
        setPhase('hide')
        if (action === 'primary') onPrimary()
        else if (onSecondary) onSecondary()
    }

    return (
        <View
            className="absolute top-0 left-0 right-0 bottom-0 justify-center items-center"
            style={{ zIndex: 250, backgroundColor: backdrop, padding: 24 }}
        >
            <View
                style={{
                    width: 460,
                    maxWidth: '100%',
                    backgroundColor: bg,
                    borderColor: border,
                    borderWidth: 1,
                    borderRadius: 20,
                    overflow: 'hidden',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 12 },
                    shadowOpacity: 0.2,
                    shadowRadius: 32,
                    elevation: 12,
                }}
            >
                {/* Accent edge along the top — same role as the SVG draw-on
                    in the marketing CTA: a small cue that this surface is
                    distinct from the rest of the chrome. */}
                <View style={{ height: 3, backgroundColor: accent }} />

                <View style={{ padding: 28 }}>
                    <View
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            backgroundColor: accent,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 18,
                        }}
                    >
                        <Icon size={22} color={accentFg} />
                    </View>

                    <Text style={{ fontSize: 22, fontWeight: '700', color: fg, marginBottom: 8 }}>
                        {title}
                    </Text>
                    <Text
                        style={{
                            fontSize: 14,
                            lineHeight: 20,
                            color: muted,
                            marginBottom: children ? 20 : 24,
                        }}
                    >
                        {intro}
                    </Text>

                    {children ? (
                        <View style={{ gap: 12, marginBottom: 24 }}>{children}</View>
                    ) : null}

                    <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
                        {secondaryLabel ? (
                            <Pressable
                                onPress={() => dismiss('secondary')}
                                style={{
                                    paddingVertical: 10,
                                    paddingHorizontal: 16,
                                    borderRadius: 10,
                                }}
                            >
                                <Text style={{ fontSize: 14, fontWeight: '600', color: muted }}>
                                    {secondaryLabel}
                                </Text>
                            </Pressable>
                        ) : null}
                        <Pressable
                            onPress={() => dismiss('primary')}
                            style={{
                                paddingVertical: 10,
                                paddingHorizontal: 18,
                                borderRadius: 10,
                                backgroundColor: accent,
                            }}
                        >
                            <Text
                                style={{ fontSize: 14, fontWeight: '700', color: accentFg }}
                            >
                                {primaryLabel}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </View>
    )
}

/**
 * One-line bullet for the modal body. A leading dot + a heading + a thin
 * subtitle on the next line. Designed to read as a punchy list at a glance —
 * three of these is the sweet spot.
 */
export interface FirstRunModalBulletProps {
    label: string
    detail: string
}

export function FirstRunModalBullet({ label, detail }: FirstRunModalBulletProps) {
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')
    const accent = useThemeColor('primary')

    return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View
                style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    marginTop: 7,
                    backgroundColor: accent,
                }}
            />
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: fg, marginBottom: 1 }}>
                    {label}
                </Text>
                <Text style={{ fontSize: 13, lineHeight: 18, color: muted }}>{detail}</Text>
            </View>
        </View>
    )
}
