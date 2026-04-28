import { Pressable, Text } from 'react-native'
import { getCoreConfigOptional } from '@tinycld/core/lib/core-config'

const FALLBACK_URL = 'https://tinycld.org'
const FALLBACK_LABEL = 'tinycld.org'

interface DefaultServerButtonProps {
    onPick: (url: string) => void
    disabled?: boolean
}

export function DefaultServerButton({ onPick, disabled }: DefaultServerButtonProps) {
    const config = getCoreConfigOptional()
    const serverUrl = config?.defaultServer ?? FALLBACK_URL
    const label = hostLabel(config?.defaultServer) ?? FALLBACK_LABEL
    return (
        <Pressable
            onPress={() => onPick(serverUrl)}
            disabled={disabled}
            style={{ paddingVertical: 8 }}
        >
            <Text style={{ fontSize: 13, color: '#60a5fa', textDecorationLine: 'underline' }}>
                Use default {label} server
            </Text>
        </Pressable>
    )
}

function hostLabel(url: string | undefined): string | null {
    if (!url) return null
    try {
        return new URL(url).host
    } catch {
        return null
    }
}
