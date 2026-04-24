import { LabelManagerPanel } from '@tinycld/core/components/LabelManagerDialog'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useRouter } from 'expo-router'
import { ArrowLeft, Tag } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'

export default function LabelsSettings() {
    const router = useRouter()
    const fgColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const bgColor = useThemeColor('background')

    return (
        <View className="flex-1" style={{ backgroundColor: bgColor }}>
            <View className="flex-row gap-3 items-center p-5 pb-0">
                <Pressable onPress={() => router.back()}>
                    <ArrowLeft size={24} color={fgColor} />
                </Pressable>
                <Tag size={24} color={fgColor} />
                <Text style={{ fontSize: 22, fontWeight: 'bold', color: fgColor }}>Labels</Text>
            </View>
            <View className="flex-1 p-4 max-w-[600px]">
                <Text className="mb-4" style={{ fontSize: 13, color: mutedColor }}>
                    Manage labels for organizing items across your workspace.
                </Text>
                <LabelManagerPanel />
            </View>
        </View>
    )
}
