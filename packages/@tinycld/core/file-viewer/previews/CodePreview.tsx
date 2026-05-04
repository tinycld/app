import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Platform, ScrollView, Text, View } from 'react-native'
import { getFileURL } from '../file-url'
import type { PreviewProps } from '../types'

export function CodePreview({ source }: PreviewProps) {
    const [content, setContent] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const fileUrl = getFileURL(source)

    const loadContent = useCallback(async () => {
        if (!fileUrl || Platform.OS !== 'web') {
            setLoading(false)
            return
        }
        try {
            const resp = await fetch(fileUrl)
            const text = await resp.text()
            setContent(text.slice(0, 100_000))
        } catch {
            setContent('Failed to load file content')
        } finally {
            setLoading(false)
        }
    }, [fileUrl])

    useEffect(() => {
        loadContent()
    }, [loadContent])

    if (loading) {
        return (
            <View className="flex-1 items-center justify-center">
                <ActivityIndicator />
            </View>
        )
    }

    if (content === null) {
        return (
            <View className="flex-1 items-center justify-center p-4">
                <Text className="text-muted-foreground">Cannot preview this file</Text>
            </View>
        )
    }

    return (
        <ScrollView className="flex-1 p-4">
            <Text className="text-foreground" style={{ fontSize: 13, fontFamily: 'monospace' }}>
                {content}
            </Text>
        </ScrollView>
    )
}
