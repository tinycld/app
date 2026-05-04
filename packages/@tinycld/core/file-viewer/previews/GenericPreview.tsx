import { formatBytes } from '@tinycld/core/lib/format-utils'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Download } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { getFileURL } from '../file-url'
import { getFileIconForMime } from '../file-icons'
import type { PreviewProps } from '../types'

export function GenericPreview({ source }: PreviewProps) {
    const mutedColor = useThemeColor('muted-foreground')
    const primaryFgColor = useThemeColor('primary-foreground')
    const { icon: FileIcon, color: iconColor } = getFileIconForMime(source.mimeType, mutedColor)
    const fileUrl = getFileURL(source)

    const handleDownload = () => {
        if (!fileUrl) return
        if (typeof window !== 'undefined') {
            const a = document.createElement('a')
            a.href = fileUrl
            a.download = source.displayName
            a.click()
        }
    }

    return (
        <View className="flex-1 items-center justify-center p-8">
            <FileIcon size={80} color={iconColor} />
            <Text
                className="mt-4 text-foreground"
                style={{
                    fontSize: 20,
                    fontWeight: '600',
                }}
            >
                {source.displayName}
            </Text>
            <Text className="mt-1 text-muted-foreground" style={{ fontSize: 13 }}>
                {source.mimeType} · {formatBytes(source.size)}
            </Text>
            {fileUrl && (
                <Pressable
                    onPress={handleDownload}
                    className="flex-row items-center gap-2 mt-5 px-5 py-3 rounded-lg bg-primary"
                >
                    <Download size={16} color={primaryFgColor} />
                    <Text className="text-primary-foreground" style={{ fontWeight: '600' }}>
                        Download
                    </Text>
                </Pressable>
            )}
        </View>
    )
}
