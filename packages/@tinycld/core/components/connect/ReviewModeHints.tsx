import { Pressable, Text, View } from 'react-native'
import { isReviewBuild } from '@tinycld/core/lib/build-mode'
import { getCoreConfigOptional } from '@tinycld/core/lib/core-config'

const FALLBACK_DEMO_EMAIL = 'appreview@tinycld.org'

interface ReviewModeHintsProps {
    onPrefill: (email: string, password: string) => void
}

export function ReviewModeHints({ onPrefill }: ReviewModeHintsProps) {
    if (!isReviewBuild()) return null
    const config = getCoreConfigOptional()
    const demoEmail = config?.demoEmail ?? FALLBACK_DEMO_EMAIL
    const demoPassword = config?.demoPassword ?? ''
    return (
        <View
            style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)',
                borderRadius: 8,
                padding: 12,
            }}
        >
            <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
                App Review build
            </Text>
            <Pressable
                onPress={() => onPrefill(demoEmail, demoPassword)}
                style={{ paddingVertical: 4 }}
            >
                <Text style={{ fontSize: 13, color: '#60a5fa', textDecorationLine: 'underline' }}>
                    Fill demo credentials
                </Text>
            </Pressable>
        </View>
    )
}
