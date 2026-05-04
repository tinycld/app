import { Platform, View } from 'react-native'
import { getFileURL } from '../file-url'
import type { PreviewProps } from '../types'
import { GenericPreview } from './GenericPreview'

export function VideoPreview(props: PreviewProps) {
    const fileUrl = getFileURL(props.source)

    if (!fileUrl) return null

    if (Platform.OS === 'web') {
        return (
            <View className="flex-1 items-center justify-center">
                {/* biome-ignore lint/a11y/useMediaCaption: captions not available for user uploads */}
                <video src={fileUrl} controls style={{ maxWidth: '100%', maxHeight: '100%' }} />
            </View>
        )
    }

    return <GenericPreview {...props} />
}
