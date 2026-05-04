import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Image, View } from 'react-native'
import { getThumbnailURL } from './file-url'
import { getFileIconForMime } from './file-icons'
import type { ThumbnailProps } from './types'

export function Thumbnail({ source, size = 120 }: ThumbnailProps) {
    const mutedColor = useThemeColor('muted-foreground')
    const { icon: FileIcon, color: iconColor } = getFileIconForMime(source.mimeType, mutedColor)

    const thumbnailUrl = getThumbnailURL(source, `${size}x${size}`)

    if (!thumbnailUrl) {
        return (
            <View
                className="items-center justify-center w-full"
                style={{
                    height: size,
                }}
            >
                <FileIcon size={size * 0.33} color={iconColor} />
            </View>
        )
    }

    return (
        <Image
            source={{ uri: thumbnailUrl }}
            style={{ width: size, height: size, borderRadius: 4 }}
            resizeMode="cover"
        />
    )
}
