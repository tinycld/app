import type { ComponentType } from 'react'

/**
 * The minimal metadata core's file viewer needs in order to display, fetch, and
 * thumbnail any PocketBase-backed file. Each consuming package (drive, mail, …)
 * adapts its own record shape into this type at the call site.
 */
export interface FilePreviewSource {
    collectionId: string
    recordId: string
    /** PocketBase file field value — the on-disk filename including the random suffix. */
    fileName: string
    /** Display name shown in the UI (typically with the random suffix stripped). */
    displayName: string
    mimeType: string
    size: number
    /**
     * Optional dedicated thumbnail file (e.g. a PDF first-page render, an Office
     * preview). When absent, image MIME types fall back to PocketBase's `?thumb=`
     * query parameter on the original file.
     */
    thumbnailFileName?: string
}

export interface PreviewProps {
    source: FilePreviewSource
    onClose: () => void
    onNext?: () => void
    onPrevious?: () => void
}

export interface ThumbnailProps {
    source: FilePreviewSource
    size?: number
}

export interface PreviewRegistryEntry {
    thumbnail?: ComponentType<ThumbnailProps>
    preview: ComponentType<PreviewProps>
}
