# Web Tiptap Editor & Email Image Proxy

## Summary

Replace TenTap (iframe-based) with direct Tiptap on web for compose and document editing. Keep TenTap on native. Add a server-side image proxy for email viewing with client-side URL rewriting.

## Motivation

TenTap renders Tiptap inside a WebView/iframe on all platforms. On web this is architecturally wrong — it introduces async content access, requires JS injection hacks (`setContentWhenReady`), prevents direct DOM integration, and limits the extension ecosystem. Since TenTap wraps Tiptap internally, the HTML output is identical — making a platform split low-risk.

Email images currently load directly from external servers, exposing user IPs and enabling tracking pixels.

## Architecture

### Unified Editor API

A platform-agnostic `EditorHandle` interface consumed by all editor components and toolbars:

```ts
interface EditorHandle {
    getHTML(): Promise<string>
    getText(): Promise<string>
    setContent(html: string): void
    focus(position?: 'start' | 'end'): void
    clear(): void
    isActive(name: string): boolean
    toggleBold(): void
    toggleItalic(): void
    toggleUnderline(): void
    toggleBulletList(): void
    toggleOrderedList(): void
    toggleBlockquote(): void
    toggleHeading(level: number): void
    setLink(url: string): void
    removeLink(): void
    undo(): void
    redo(): void
}
```

- `getHTML()` / `getText()` return `Promise<string>` to accommodate TenTap's async bridge on native. On web they resolve immediately.
- `isActive()` drives toolbar active states uniformly across platforms.

### Editor Hooks — Platform Split

Two editor hooks, each with `.web.ts` and `.native.ts` variants:

- `useMailEditor(options)` — bold, italic, underline, lists, blockquote, link, history, placeholder
- `useDocumentEditor(options)` — same + headings

Each returns `{ editor: EditorHandle, EditorComponent, toolbarState, commands }`.

**Web (`.web.ts`):** Uses `@tiptap/react`'s `useEditor` with StarterKit, Underline, Link, Placeholder extensions. `EditorComponent` renders `<EditorContent />` directly in the DOM. Styling via Tailwind className + a small CSS file for ProseMirror internals.

**Native (`.native.ts`):** Current TenTap implementation — `useEditorBridge` with BridgeExtensions. `EditorComponent` renders `<RichText />` in a WebView. The `setContentWhenReady` logic stays on native where it's actually needed.

### Toolbar — Platform Agnostic

Toolbars (`ComposeToolbar`, `DocumentToolbar`) receive `commands` and `state` as props from the editor hook. They never import TenTap or Tiptap directly.

```ts
interface ToolbarProps {
    commands: {
        toggleBold(): void
        toggleItalic(): void
        toggleUnderline(): void
        toggleBulletList(): void
        toggleOrderedList(): void
        toggleBlockquote(): void
        setLink(url: string): void
        removeLink(): void
        undo(): void
        redo(): void
    }
    state: {
        isBoldActive: boolean
        isItalicActive: boolean
        isUnderlineActive: boolean
        isBulletListActive: boolean
        isOrderedListActive: boolean
        isBlockquoteActive: boolean
        isLinkActive: boolean
        currentLink: string | null
    }
}
```

Single toolbar implementation, zero platform code.

### RichTextEditor / DocumentEditor Components

Platform-split component files:

- `RichTextEditor.web.tsx` — renders `<EditorContent />` with Tailwind styling
- `RichTextEditor.native.tsx` — renders `<RichText />` from TenTap (current code)
- Same pattern for `DocumentEditor`

### Email Viewing — Unchanged

Email display in `EmailBody.tsx` continues to use a sandboxed iframe (`sandbox=""`) with `srcDoc`. This is the correct approach for untrusted HTML. No changes to viewing architecture.

### Image Proxy

**Server endpoint** in `packages/mail/server/`:

- Route: `GET /api/mail/image-proxy?url={encoded_url}`
- Auth: requires valid PocketBase auth token
- Fetches external image and returns with correct `Content-Type`
- In-memory LRU cache: 1 hour TTL, ~100MB max
- Security:
  - Validate URL scheme is `http` or `https` only
  - Reject private/loopback IPs (SSRF protection)
  - Cap response size at 10MB
  - Return `Cache-Control` headers for browser caching

**Client-side URL rewriting** in `EmailBody.tsx`:

Before setting `iframe.srcDoc`, rewrite external image URLs to route through the proxy:

```ts
function proxyImageUrls(html: string): string {
    return html.replace(
        /(<img[^>]+src=["'])(?!cid:)(https?:\/\/[^"']+)(["'])/gi,
        (_, prefix, url, suffix) =>
            `${prefix}/api/mail/image-proxy?url=${encodeURIComponent(url)}${suffix}`
    )
}
```

- Skips `cid:` URLs (inline attachments, already local)
- Only rewrites `http://` and `https://` schemes
- Runs once when HTML is fetched, before rendering

## Dependencies

New packages (web only):
- `@tiptap/react`
- `@tiptap/pm`
- `@tiptap/starter-kit`
- `@tiptap/extension-underline`
- `@tiptap/extension-link`
- `@tiptap/extension-placeholder`

Existing packages retained:
- `@10play/tentap-editor` (native only)
- `@10play/react-native-web-webview` — can be removed after migration

## Files Changed

### New Files
- `packages/mail/hooks/useMailEditor.web.ts`
- `packages/mail/hooks/useMailEditor.native.ts` (rename from current `useMailEditor.ts`)
- `packages/docs/hooks/useDocumentEditor.web.ts`
- `packages/docs/hooks/useDocumentEditor.native.ts` (rename from current)
- `packages/mail/components/RichTextEditor.web.tsx`
- `packages/mail/components/RichTextEditor.native.tsx` (rename from current)
- `packages/docs/components/DocumentEditor.web.tsx`
- `packages/docs/components/DocumentEditor.native.tsx` (rename from current)
- `packages/mail/server/image_proxy.go`
- `packages/mail/server/image_proxy_test.go`
- `lib/proxy-image-urls.ts` (shared utility for URL rewriting)
- `packages/mail/editor.css` or similar (ProseMirror web styles)

### Modified Files
- `packages/mail/components/ComposeToolbar.tsx` — consume props instead of `useBridgeState`
- `packages/docs/components/DocumentToolbar.tsx` — same
- `packages/mail/components/ComposeWindow.tsx` — use new hook API
- `packages/mail/components/InlineReply.tsx` — use new hook API
- `packages/mail/components/EmailBody.tsx` — add `proxyImageUrls()` call before rendering
- `package.json` — add tiptap deps

### Removed
- `@10play/react-native-web-webview` dependency (no longer needed on web)

## Testing

- Unit tests for `proxyImageUrls()` — preserves CID, rewrites http/https, handles edge cases
- Go tests for image proxy endpoint — auth, SSRF rejection, size limits, caching headers
- Manual testing: compose, reply, forward on both web and native
- Manual testing: email viewing with proxied images
- Verify HTML output parity between web (Tiptap) and native (TenTap) editors
