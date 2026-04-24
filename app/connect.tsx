import { DefaultServerButton } from '@tinycld/core/components/connect/DefaultServerButton'
import {
    normalizeAddress,
    probe,
    setResolvedAddress,
    writeCached,
} from '@tinycld/core/lib/server-address'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'

export default function Connect() {
    const { backTo } = useLocalSearchParams<{ backTo?: string }>()
    const [url, setUrl] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    async function onConnect() {
        setError(null)
        if (!url.trim()) {
            setError('Enter a server URL.')
            return
        }
        setBusy(true)
        const addr = normalizeAddress(url)
        try {
            await probe(addr)
            await writeCached(addr)
            setResolvedAddress(addr)
            const target = backTo?.startsWith('/') ? backTo : '/'
            router.replace(target)
        } catch (err) {
            const reason = err instanceof Error ? err.message : 'Connection failed'
            setError(`Couldn't reach server at ${addr}: ${reason}`)
            setBusy(false)
        }
    }

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <Text style={styles.title}>Connect to your TinyCld server</Text>
                <Text style={styles.subtitle}>
                    Enter the URL of your server. This will be saved for next time.
                </Text>
                <TextInput
                    value={url}
                    onChangeText={setUrl}
                    placeholder="https://pb.example.com"
                    placeholderTextColor="#9ca3af"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    style={styles.input}
                    editable={!busy}
                />
                <DefaultServerButton onPick={setUrl} disabled={busy} />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Pressable
                    onPress={onConnect}
                    disabled={busy}
                    style={[styles.button, busy && styles.buttonDisabled]}
                >
                    <Text style={styles.buttonText}>{busy ? 'Connecting…' : 'Connect'}</Text>
                </Pressable>
            </View>
        </View>
    )
}

const styles = {
    container: {
        flex: 1,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        padding: 20,
        backgroundColor: '#0b0b0c',
    },
    card: {
        width: '100%' as const,
        maxWidth: 420,
        padding: 24,
        borderRadius: 12,
        backgroundColor: '#1a1a1c',
        borderWidth: 1,
        borderColor: '#2a2a2d',
        gap: 14,
    },
    title: {
        fontSize: 20,
        fontWeight: '600' as const,
        color: '#f5f5f5',
    },
    subtitle: {
        fontSize: 13,
        color: '#9ca3af',
        lineHeight: 18,
    },
    input: {
        borderWidth: 1,
        borderColor: '#3a3a3d',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: '#f5f5f5',
        backgroundColor: '#0b0b0c',
    },
    error: {
        fontSize: 12,
        color: '#f87171',
    },
    button: {
        backgroundColor: '#2563eb',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center' as const,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: '#ffffff',
        fontWeight: '600' as const,
        fontSize: 14,
    },
}
