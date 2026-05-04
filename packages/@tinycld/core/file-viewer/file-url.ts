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

        // Place the file in a unique subdirectory under cache so repeated
        // downloads don't collide and we can keep the user-facing filename
        // (which the share sheet's "Save as…" defaults to) unchanged.
        // downloadFileAsync errors out if the destination already exists.
        const subdir = new Directory(Paths.cache, `download-${Date.now()}`)
        subdir.create({ intermediates: true, idempotent: true })
        const target = new File(subdir, fileName)
        const downloaded = await File.downloadFileAsync(url, target)

        // For images, route directly to Photos via expo-media-library — the
        // generic share sheet's "Save Image" entry depends on iOS UTI
        // inference from the cache file URI and is unreliable across iOS
        // versions and the simulator. media-library calls into PHPhotoLibrary
        // directly, which is what the user actually wants when they hit
        // Download on a JPEG/PNG.
        if (isImageMime(mimeType, fileName)) {
            const MediaLibrary = await import('expo-media-library')
            const perm = await MediaLibrary.requestPermissionsAsync(true)
            if (!perm.granted) {
                throw new Error('Permission to save photos was denied')
            }
            await MediaLibrary.saveToLibraryAsync(downloaded.uri)
            notify.emit({
                event: 'file.saved_to_photos',
                title: 'Saved to Photos',
                body: fileName,
                data: { fileName },
            })
            return
        }

        // For everything else, hand the file to the system share sheet so
        // the user can pick Save to Files / AirDrop / send-to-app.
        if (!(await Sharing.isAvailableAsync())) {
            throw new Error('Sharing is not available on this device')
        }
        await Sharing.shareAsync(downloaded.uri, {
            mimeType,
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

function isImageMime(mimeType: string, fileName: string): boolean {
    if (mimeType.toLowerCase().startsWith('image/')) return true
    const ext = fileName.toLowerCase().split('.').pop()
    return ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'heic' || ext === 'webp' || ext === 'bmp' || ext === 'tiff'
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

