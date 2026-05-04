import { pb } from '@tinycld/core/lib/pocketbase'
import type { FilePreviewSource } from './types'

const DEFAULT_THUMB_SIZE = '480x360'

export function getFileURL(source: FilePreviewSource): string {
    if (!source.fileName) return ''
    return pb.files.getURL({ collectionId: source.collectionId, id: source.recordId }, source.fileName)
}

/**
 * Returns a URL suitable for a thumbnail-sized image, or '' when no thumbnail is
 * available. Prefers a dedicated thumbnail file (e.g. a PDF first-page render);
 * falls back to PocketBase's `?thumb=` query parameter for image MIME types.
 */
export function getThumbnailURL(source: FilePreviewSource, size: string = DEFAULT_THUMB_SIZE): string {
    const baseUrl = pickThumbnailBase(source)
    if (!baseUrl) return ''
    const url = pb.files.getURL({ collectionId: source.collectionId, id: source.recordId }, baseUrl)
    return `${url}?thumb=${size}`
}

/**
 * Pure helper: which file name (if any) to use as the basis for a thumbnail URL.
 * Split out from getThumbnailURL so it can be unit-tested without instantiating
 * the PocketBase client.
 */
export function pickThumbnailBase(source: Pick<FilePreviewSource, 'mimeType' | 'fileName' | 'thumbnailFileName'>): string {
    if (source.thumbnailFileName) return source.thumbnailFileName
    if (source.mimeType.startsWith('image/') && source.fileName) return source.fileName
    return ''
}
