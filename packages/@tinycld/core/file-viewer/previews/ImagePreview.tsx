import { Image, View } from 'react-native'
import { getFileURL } from '../file-url'
import type { PreviewProps } from '../types'

export function ImagePreview({ source }: PreviewProps) {
    const fileUrl = getFileURL(source)

    if (!fileUrl) return null

    return (
        <View className="flex-1 items-center justify-center p-4">
            <Image source={{ uri: fileUrl }} className="w-full h-full" resizeMode="contain" />
        </View>
    )
}
