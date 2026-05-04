import { lazy, Suspense } from 'react'
import { ActivityIndicator, Platform } from 'react-native'
import { getFileURL } from '../file-url'
import type { PreviewProps } from '../types'
import { GenericPreview } from './GenericPreview'

const PdfCanvasViewer = lazy(() => import('./PdfCanvasViewer').then((m) => ({ default: m.PdfCanvasViewer })))

export function PdfPreview(props: PreviewProps) {
    const fileUrl = getFileURL(props.source)

    if (!fileUrl) return null
    if (Platform.OS !== 'web') return <GenericPreview {...props} />

    return (
        <Suspense fallback={<ActivityIndicator />}>
            <PdfCanvasViewer url={fileUrl} />
        </Suspense>
    )
}
