import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Modal, ModalBackdrop, ModalContent } from '@tinycld/core/ui/modal'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react-native'
import { Platform, Pressable, Modal as RNModal, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GenericPreview } from './previews/GenericPreview'
import { getPreviewEntry } from './registry'
import type { FilePreviewSource, PreviewAction } from './types'

interface PreviewModalProps {
    isVisible: boolean
    source: FilePreviewSource | null
    onClose: () => void
    onNext?: () => void
    onPrevious?: () => void
    /** Called when the user clicks the toolbar download button. If omitted, the button is hidden. */
    onDownload?: () => void
    /** Consumer-supplied toolbar actions (e.g. mail's "Save to Drive"). Each is shown as an icon button before Download. */
    actions?: PreviewAction[]
}

export function PreviewModal({
    isVisible,
    source,
    onClose,
    onNext,
    onPrevious,
    onDownload,
    actions,
}: PreviewModalProps) {
    const isMobile = useBreakpoint() === 'mobile'

    if (!source) return null

    if (isMobile || Platform.OS !== 'web') {
        return (
            <RNModal visible={isVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
                <View className="flex-1 bg-background">
                    <PreviewModalContent
                        source={source}
                        onClose={onClose}
                        onNext={onNext}
                        onPrevious={onPrevious}
                        onDownload={onDownload}
                        actions={actions}
                    />
                </View>
            </RNModal>
        )
    }

    return (
        <Modal isOpen={isVisible} onClose={onClose}>
            <ModalBackdrop />
            <ModalContent className="w-[95vw] h-[90vh] max-w-[1400px] p-0 rounded-xl overflow-hidden">
                <PreviewModalContent
                    source={source}
                    onClose={onClose}
                    onNext={onNext}
                    onPrevious={onPrevious}
                    onDownload={onDownload}
                    actions={actions}
                />
            </ModalContent>
        </Modal>
    )
}

interface PreviewModalContentProps {
    source: FilePreviewSource
    onClose: () => void
    onNext?: () => void
    onPrevious?: () => void
    onDownload?: () => void
    actions?: PreviewAction[]
}

function PreviewModalContent({
    source,
    onClose,
    onNext,
    onPrevious,
    onDownload,
    actions,
}: PreviewModalContentProps) {
    const mutedColor = useThemeColor('muted-foreground')
    const insets = useSafeAreaInsets()

    const entry = getPreviewEntry(source.mimeType)
    const PreviewComponent = entry?.preview ?? GenericPreview

    return (
        <>
            <View
                className="flex-row items-center px-4 py-3 gap-3 border-b border-border"
                style={{ paddingTop: Math.max(insets.top, 12) }}
            >
                <Pressable onPress={onClose} className="p-1.5">
                    <X size={20} color={mutedColor} />
                </Pressable>
                <Text
                    numberOfLines={1}
                    className="flex-1 text-foreground"
                    style={{
                        fontSize: 16,
                        fontWeight: '600',
                    }}
                >
                    {source.displayName}
                </Text>
                <View className="flex-row items-center gap-1">
                    {onPrevious && (
                        <Pressable onPress={onPrevious} className="p-1.5 rounded-md" hitSlop={8}>
                            <ChevronLeft size={20} color={mutedColor} />
                        </Pressable>
                    )}
                    {onNext && (
                        <Pressable onPress={onNext} className="p-1.5 rounded-md" hitSlop={8}>
                            <ChevronRight size={20} color={mutedColor} />
                        </Pressable>
                    )}
                    {actions?.map((action) => {
                        const ActionIcon = action.icon
                        return (
                            <Pressable
                                key={action.id}
                                onPress={() => action.onPress(source)}
                                disabled={action.isPending}
                                className="p-1.5 rounded-md"
                                hitSlop={8}
                                accessibilityLabel={action.label}
                            >
                                <ActionIcon size={18} color={mutedColor} />
                            </Pressable>
                        )
                    })}
                    {onDownload && (
                        <Pressable onPress={onDownload} className="p-1.5 rounded-md" hitSlop={8}>
                            <Download size={18} color={mutedColor} />
                        </Pressable>
                    )}
                </View>
            </View>
            <View className="flex-1 overflow-hidden">
                <PreviewComponent source={source} onClose={onClose} onNext={onNext} onPrevious={onPrevious} />
            </View>
        </>
    )
}
