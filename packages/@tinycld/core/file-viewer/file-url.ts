import { notify } from '@tinycld/core/lib/notify'
import { pb } from '@tinycld/core/lib/pocketbase'
import { Platform } from 'react-native'
import { pickThumbnailBase } from './pick-thumbnail-base'
import type { FilePreviewSource } from './types'

export { pickThumbnailBase }

const DEFAULT_THUMB_SIZE = '480x360'

export function getFileURL(source: FilePreviewSource): string {
    if (!source.fileName) return ''
    return pb.files.getURL({ collectionId: source.collectionId, id: source.recordId }, source.fileName)
}

/**
 * Save a previewable file to the user's device. Web triggers a browser
 * download; native downloads to the cache directory and hands the file to
 * the OS share sheet (Save to Files, Save Image for image MIMEs, AirDrop,
 * send-to-app, etc.). Fire-and-forget: callers don't need to await.
 */
export function downloadFile(source: FilePreviewSource) {
    const url = getFileURL(source)
    if (!url) return
    downloadFromUrl(url, source.displayName, source.mimeType)
}

/**
 * Like downloadFile but for a pre-built URL (e.g. drive's public-share
 * endpoint, which uses a token-based path rather than a FilePreviewSource).
 */
export function downloadFromUrl(url: string, fileName: string, mimeType: string) {
    if (Platform.OS === 'web') {
        // PocketBase serves files with `?download=1` as Content-Disposition:
        // attachment. URLs that already encode their own download semantics
        // (drive's share-link `?inline=0`) are passed through untouched.
        const href = url.includes('?') ? url : `${url}?download=1`
        const a = document.createElement('a')
        a.href = href
        a.download = fileName
        a.click()
        return
    }
    void saveOnNative(url, fileName, mimeType)
}

async function saveOnNative(url: string, fileName: string, mimeType: string) {
    try {
        // Lazy-import the native modules so file-url.ts can be safely loaded
        // by code paths (previews, thumbnails) that never need to save —
        // module-init failures from expo-file-system / expo-sharing would
        // otherwise propagate up the import graph and freeze the boot gate.
        const [{ Directory, File, Paths }, Sharing] = await Promise.all([
            import('expo-file-system'),
            import('expo-sharing'),
        ])
        if (!(await Sharing.isAvailableAsync())) {
            throw new Error('Sharing is not available on this device')
        }
        // Place the file in a unique subdirectory under cache so repeated
        // downloads don't collide and we can keep the user-facing filename
        // (which the share sheet's "Save as…" defaults to) unchanged.
        // downloadFileAsync errors out if the destination already exists,
        // which is exactly what happened the second time the user tapped
        // Download for the same attachment.
        const subdir = new Directory(Paths.cache, `download-${Date.now()}`)
        subdir.create({ intermediates: true, idempotent: true })
        const target = new File(subdir, fileName)
        const downloaded = await File.downloadFileAsync(url, target)
        // Hint the system about the file type so the share sheet can offer
        // type-appropriate destinations (e.g. "Save Image" for image MIMEs,
        // which routes into Photos). On iOS the share sheet picks targets
        // from the file's UTI; mapping MIME → UTI explicitly avoids relying
        // on the file extension alone, which is sometimes ambiguous (e.g.
        // jpg vs jpeg, heic without an extension).
        await Sharing.shareAsync(downloaded.uri, {
            mimeType,
            UTI: mimeTypeToUTI(mimeType, fileName),
            dialogTitle: fileName,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        notify.emit({
            event: 'mutation.error',
            title: 'Could not save file',
            body: message,
            data: { operation: 'downloadFile', error: message },
        })
    }
}

// MIME type → iOS Uniform Type Identifier. Anything not listed falls back to
// the generic `public.data`, in which case iOS picks share-sheet targets from
// the filename extension. The image entries are what unlock "Save Image" →
// Photos in the share sheet; the rest cover the file types we commonly serve.
const MIME_TO_UTI: Record<string, string> = {
    'image/jpeg': 'public.jpeg',
    'image/jpg': 'public.jpeg',
    'image/png': 'public.png',
    'image/gif': 'com.compuserve.gif',
    'image/heic': 'public.heic',
    'image/heif': 'public.heif',
    'image/webp': 'org.webmproject.webp',
    'image/tiff': 'public.tiff',
    'image/bmp': 'com.microsoft.bmp',
    'image/svg+xml': 'public.svg-image',
    'video/mp4': 'public.mpeg-4',
    'video/quicktime': 'com.apple.quicktime-movie',
    'audio/mpeg': 'public.mp3',
    'audio/mp4': 'public.mpeg-4-audio',
    'application/pdf': 'com.adobe.pdf',
    'text/plain': 'public.plain-text',
    'text/html': 'public.html',
    'application/zip': 'public.zip-archive',
}

function mimeTypeToUTI(mimeType: string, fileName: string): string {
    const direct = MIME_TO_UTI[mimeType.toLowerCase()]
    if (direct) return direct
    // Fall back to extension-based UTI for the common image cases — some
    // PocketBase records carry an empty/garbled mimeType but a usable name.
    const ext = fileName.toLowerCase().split('.').pop()
    if (ext === 'jpg' || ext === 'jpeg') return 'public.jpeg'
    if (ext === 'png') return 'public.png'
    if (ext === 'gif') return 'com.compuserve.gif'
    if (ext === 'heic') return 'public.heic'
    return 'public.data'
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

