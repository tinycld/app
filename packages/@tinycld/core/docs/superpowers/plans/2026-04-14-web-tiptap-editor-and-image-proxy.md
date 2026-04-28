# Web Tiptap Editor & Email Image Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TenTap with direct Tiptap on web for compose/docs editing, keep TenTap on native, add server-side image proxy for email viewing.

**Architecture:** Platform-split editor hooks (`.web.ts` / `.native.ts`) expose a unified `EditorHandle` API. Toolbars consume `commands`/`state` props instead of importing editor libraries directly. A Go image proxy endpoint handles external email images with in-memory caching. Client-side URL rewriting in `EmailBody.tsx` routes images through the proxy before rendering.

**Tech Stack:** `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, Go (PocketBase hooks), bluemonday

---

## File Structure

### New Files
- `lib/editor-types.ts` — shared `EditorHandle`, `EditorToolbarState`, `EditorCommands` types
- `packages/mail/hooks/useMailEditor.web.ts` — Tiptap web editor hook
- `packages/mail/hooks/useMailEditor.native.ts` — TenTap native editor hook (moved from current)
- `packages/mail/components/RichTextEditor.web.tsx` — web editor component
- `packages/mail/components/RichTextEditor.native.tsx` — native editor component (moved from current)
- `packages/mail/styles/editor.css` — ProseMirror web styles
- `packages/docs/hooks/useDocumentEditor.web.ts` — Tiptap web docs editor hook
- `packages/docs/hooks/useDocumentEditor.native.ts` — TenTap native docs editor hook (moved from current)
- `packages/docs/components/DocumentEditor.web.tsx` — web docs editor component
- `packages/docs/components/DocumentEditor.native.tsx` — native docs editor component (moved from current)
- `lib/proxy-image-urls.ts` — URL rewriting utility
- `lib/__tests__/proxy-image-urls.test.ts` — tests for URL rewriting
- `packages/mail/server/endpoints_image_proxy.go` — image proxy endpoint
- `packages/mail/server/endpoints_image_proxy_test.go` — image proxy tests

### Modified Files
- `package.json` — add tiptap deps, remove `@10play/react-native-web-webview`
- `packages/mail/components/ComposeToolbar.tsx` — consume `commands`/`state` props
- `packages/docs/components/DocumentToolbar.tsx` — consume `commands`/`state` props
- `packages/mail/components/ComposeWindow.tsx` — use new hook API
- `packages/mail/components/InlineReply.tsx` — use new hook API
- `packages/mail/components/EmailBody.tsx` — add `proxyImageUrls()` call
- `packages/mail/server/register.go` — register image proxy route

---

### Task 1: Shared Editor Types

**Files:**
- Create: `lib/editor-types.ts`

- [ ] **Step 1: Create the shared types file**

```ts
// lib/editor-types.ts

export interface EditorHandle {
    getHTML(): Promise<string>
    getText(): Promise<string>
    setContent(html: string): void
    focus(position?: 'start' | 'end'): void
    clear(): void
}

export interface EditorToolbarState {
    isBoldActive: boolean
    isItalicActive: boolean
    isUnderlineActive: boolean
    isBulletListActive: boolean
    isOrderedListActive: boolean
    isBlockquoteActive: boolean
    isLinkActive: boolean
    currentLink: string | null
}

export interface EditorCommands {
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

export interface EditorResult {
    editor: EditorHandle
    EditorComponent: React.ComponentType
    commands: EditorCommands
    toolbarState: EditorToolbarState
}
```

- [ ] **Step 2: Run checks**

Run: `npm run checks`
Expected: PASS (new file, no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add lib/editor-types.ts
git commit -m "feat: add shared EditorHandle types for platform-split editor"
```

---

### Task 2: Install Tiptap Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install tiptap packages**

Run: `npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-link @tiptap/extension-placeholder`

- [ ] **Step 2: Remove web-webview polyfill**

Run: `npm uninstall @10play/react-native-web-webview`

- [ ] **Step 3: Run checks**

Run: `npm run checks`
Expected: PASS. If there are bundler alias references to `@10play/react-native-web-webview` in metro config or similar, remove those too.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add tiptap deps, remove web-webview polyfill"
```

---

### Task 3: Mail Editor — Native Hook (Rename)

**Files:**
- Rename: `packages/mail/hooks/useMailEditor.ts` → `packages/mail/hooks/useMailEditor.native.ts`
- Rename: `packages/mail/components/RichTextEditor.tsx` → `packages/mail/components/RichTextEditor.native.tsx`

- [ ] **Step 1: Rename the mail editor hook**

```bash
git mv packages/mail/hooks/useMailEditor.ts packages/mail/hooks/useMailEditor.native.ts
```

- [ ] **Step 2: Update the hook to return `EditorResult` shape**

Modify `packages/mail/hooks/useMailEditor.native.ts`:

The hook currently returns an `EditorBridge` directly. Wrap it to return `EditorResult`. Also move the `useEditorHandle` and `setContentWhenReady` exports here since they're native-specific.

```ts
import {
    BlockquoteBridge,
    BoldBridge,
    BulletListBridge,
    CoreBridge,
    DropCursorBridge,
    type EditorBridge,
    HardBreakBridge,
    HistoryBridge,
    ItalicBridge,
    LinkBridge,
    OrderedListBridge,
    PlaceholderBridge,
    RichText,
    UnderlineBridge,
    useBridgeState,
    useEditorBridge,
} from '@10play/tentap-editor'
import { type RefObject, useCallback, useMemo } from 'react'
import { Platform, View } from 'react-native'
import type {
    EditorCommands,
    EditorHandle,
    EditorResult,
    EditorToolbarState,
} from '~/lib/editor-types'
import { useThemeColor } from '~/lib/use-app-theme'

function buildEditorCSS(colors: { bg: string; fg: string; placeholder: string; primary: string }) {
    return `
        * {
            background-color: ${colors.bg};
            color: ${colors.fg};
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .ProseMirror {
            padding: 0;
            min-height: 100%;
            font-size: 14px;
            line-height: 1.5;
        }
        .ProseMirror:focus {
            outline: none;
        }
        .is-editor-empty:first-child::before {
            color: ${colors.placeholder};
            content: attr(data-placeholder);
            float: left;
            height: 0;
            pointer-events: none;
        }
        blockquote {
            border-left: 3px solid ${colors.placeholder};
            padding-left: 1rem;
            margin-left: 0;
        }
        a {
            color: ${colors.primary};
            text-decoration: underline;
        }
        ul, ol {
            padding-left: 1.5rem;
        }
    `
}

const baseBridgeExtensions = [
    BoldBridge,
    ItalicBridge,
    UnderlineBridge,
    BulletListBridge,
    OrderedListBridge,
    BlockquoteBridge,
    LinkBridge,
    HistoryBridge,
    HardBreakBridge,
    DropCursorBridge,
]

interface UseMailEditorOptions {
    initialContent?: string
    placeholder?: string
}

function NativeEditorComponent({ bridge }: { bridge: EditorBridge }) {
    return (
        <View className="flex-1 min-h-[100px]">
            <RichText editor={bridge} scrollEnabled={false} />
        </View>
    )
}

export function useMailEditor(options: UseMailEditorOptions = {}): EditorResult {
    const bgColor = useThemeColor('background')
    const fgColor = useThemeColor('foreground')
    const placeholderColor = useThemeColor('field-placeholder')
    const primaryColor = useThemeColor('primary')
    const placeholder = options.placeholder ?? ''

    const bridgeExtensions = useMemo(() => {
        const css = buildEditorCSS({
            bg: bgColor,
            fg: fgColor,
            placeholder: placeholderColor,
            primary: primaryColor,
        })
        return [
            CoreBridge.configureCSS(css),
            ...baseBridgeExtensions,
            PlaceholderBridge.configureExtension({ placeholder }),
        ]
    }, [bgColor, fgColor, placeholderColor, primaryColor, placeholder])

    const editorTheme = useMemo(() => ({ webview: { backgroundColor: bgColor } }), [bgColor])

    const bridge = useEditorBridge({
        initialContent: options.initialContent,
        bridgeExtensions,
        theme: editorTheme,
    })

    const editorState = useBridgeState(bridge)

    const editor: EditorHandle = useMemo(
        () => ({
            getHTML: () => bridge.getHTML(),
            getText: () => bridge.getText(),
            setContent: (html: string) => bridge.setContent(html),
            focus: (position?: 'start' | 'end') => bridge.focus(position ?? 'end'),
            clear: () => bridge.setContent(''),
        }),
        [bridge]
    )

    const commands: EditorCommands = useMemo(
        () => ({
            toggleBold: () => bridge.toggleBold(),
            toggleItalic: () => bridge.toggleItalic(),
            toggleUnderline: () => bridge.toggleUnderline(),
            toggleBulletList: () => bridge.toggleBulletList(),
            toggleOrderedList: () => bridge.toggleOrderedList(),
            toggleBlockquote: () => bridge.toggleBlockquote(),
            toggleHeading: (level: number) => bridge.toggleHeading(level),
            setLink: (url: string) => bridge.setLink(url),
            removeLink: () => bridge.setLink(''),
            undo: () => bridge.undo(),
            redo: () => bridge.redo(),
        }),
        [bridge]
    )

    const toolbarState: EditorToolbarState = {
        isBoldActive: editorState.isBoldActive,
        isItalicActive: editorState.isItalicActive,
        isUnderlineActive: editorState.isUnderlineActive,
        isBulletListActive: editorState.isBulletListActive,
        isOrderedListActive: editorState.isOrderedListActive,
        isBlockquoteActive: editorState.isBlockquoteActive,
        isLinkActive: editorState.isLinkActive,
        currentLink: editorState.activeLink ?? null,
    }

    const EditorComponent = useCallback(
        () => <NativeEditorComponent bridge={bridge} />,
        [bridge]
    )

    return { editor, EditorComponent, commands, toolbarState }
}

export function setContentWhenReady(editor: EditorHandle, content: string): () => void {
    // On native, the bridge might not be ready immediately
    editor.setContent(content)
    return () => {}
}
```

Note: The `setContentWhenReady` function is simplified here. The old complex retry logic was mainly for web (injecting JS into the WebView). On native, `bridge.setContent()` queues internally. If the native retry logic is still needed, keep the `_subscribeToEditorStateUpdate` approach from the original but operating on the bridge reference stored in the closure.

- [ ] **Step 3: Rename the RichTextEditor component**

```bash
git mv packages/mail/components/RichTextEditor.tsx packages/mail/components/RichTextEditor.native.tsx
```

Update `RichTextEditor.native.tsx` — this file now just re-exports the handle type (the actual component is embedded in the hook):

```tsx
// packages/mail/components/RichTextEditor.native.tsx
export type { EditorHandle as RichTextEditorHandle } from '~/lib/editor-types'
```

- [ ] **Step 4: Run checks**

Run: `npm run checks`
Expected: May show errors from consumers still importing old paths — that's expected, will be fixed in Task 5.

- [ ] **Step 5: Commit**

```bash
git add packages/mail/hooks/ packages/mail/components/RichTextEditor.native.tsx
git commit -m "refactor: rename mail editor files for platform split, wrap native hook in EditorResult"
```

---

### Task 4: Mail Editor — Web Hook

**Files:**
- Create: `packages/mail/hooks/useMailEditor.web.ts`
- Create: `packages/mail/components/RichTextEditor.web.tsx`
- Create: `packages/mail/styles/editor.css`

- [ ] **Step 1: Create ProseMirror web styles**

```css
/* packages/mail/styles/editor.css */
.tinycld-mail-editor .ProseMirror {
    padding: 0;
    min-height: 100px;
    font-size: 14px;
    line-height: 1.5;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    outline: none;
    flex: 1;
}

.tinycld-mail-editor .ProseMirror p.is-editor-empty:first-child::before {
    color: var(--editor-placeholder-color, #aaa);
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
}

.tinycld-mail-editor .ProseMirror blockquote {
    border-left: 3px solid var(--editor-placeholder-color, #aaa);
    padding-left: 1rem;
    margin-left: 0;
}

.tinycld-mail-editor .ProseMirror a {
    color: var(--editor-primary-color, #0066cc);
    text-decoration: underline;
}

.tinycld-mail-editor .ProseMirror ul,
.tinycld-mail-editor .ProseMirror ol {
    padding-left: 1.5rem;
}
```

- [ ] **Step 2: Create the web editor hook**

```ts
// packages/mail/hooks/useMailEditor.web.ts
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useCallback, useMemo } from 'react'
import { View } from 'react-native'
import type {
    EditorCommands,
    EditorHandle,
    EditorResult,
    EditorToolbarState,
} from '~/lib/editor-types'
import { useThemeColor } from '~/lib/use-app-theme'
import '../styles/editor.css'

interface UseMailEditorOptions {
    initialContent?: string
    placeholder?: string
}

function WebEditorComponent({ tiptapEditor }: { tiptapEditor: ReturnType<typeof useEditor> }) {
    const bgColor = useThemeColor('background')
    const fgColor = useThemeColor('foreground')
    const placeholderColor = useThemeColor('field-placeholder')
    const primaryColor = useThemeColor('primary')

    return (
        <View
            className="flex-1 min-h-[100px] tinycld-mail-editor"
            style={
                {
                    '--editor-placeholder-color': placeholderColor,
                    '--editor-primary-color': primaryColor,
                    backgroundColor: bgColor,
                    color: fgColor,
                } as React.CSSProperties
            }
        >
            <EditorContent editor={tiptapEditor} style={{ flex: 1 }} />
        </View>
    )
}

export function useMailEditor(options: UseMailEditorOptions = {}): EditorResult {
    const tiptapEditor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            Link.configure({ openOnClick: false }),
            Placeholder.configure({ placeholder: options.placeholder ?? '' }),
        ],
        content: options.initialContent ?? '',
    })

    const editor: EditorHandle = useMemo(
        () => ({
            getHTML: () => Promise.resolve(tiptapEditor?.getHTML() ?? ''),
            getText: () => Promise.resolve(tiptapEditor?.getText() ?? ''),
            setContent: (html: string) => tiptapEditor?.commands.setContent(html),
            focus: (position?: 'start' | 'end') => {
                if (position === 'start') {
                    tiptapEditor?.commands.focus('start')
                } else {
                    tiptapEditor?.commands.focus('end')
                }
            },
            clear: () => tiptapEditor?.commands.clearContent(),
        }),
        [tiptapEditor]
    )

    const commands: EditorCommands = useMemo(
        () => ({
            toggleBold: () => tiptapEditor?.chain().focus().toggleBold().run(),
            toggleItalic: () => tiptapEditor?.chain().focus().toggleItalic().run(),
            toggleUnderline: () => tiptapEditor?.chain().focus().toggleUnderline().run(),
            toggleBulletList: () => tiptapEditor?.chain().focus().toggleBulletList().run(),
            toggleOrderedList: () => tiptapEditor?.chain().focus().toggleOrderedList().run(),
            toggleBlockquote: () => tiptapEditor?.chain().focus().toggleBlockquote().run(),
            toggleHeading: (level: number) =>
                tiptapEditor?.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run(),
            setLink: (url: string) => {
                if (url) {
                    tiptapEditor?.chain().focus().setLink({ href: url }).run()
                } else {
                    tiptapEditor?.chain().focus().unsetLink().run()
                }
            },
            removeLink: () => tiptapEditor?.chain().focus().unsetLink().run(),
            undo: () => tiptapEditor?.chain().focus().undo().run(),
            redo: () => tiptapEditor?.chain().focus().redo().run(),
        }),
        [tiptapEditor]
    )

    const toolbarState: EditorToolbarState = {
        isBoldActive: tiptapEditor?.isActive('bold') ?? false,
        isItalicActive: tiptapEditor?.isActive('italic') ?? false,
        isUnderlineActive: tiptapEditor?.isActive('underline') ?? false,
        isBulletListActive: tiptapEditor?.isActive('bulletList') ?? false,
        isOrderedListActive: tiptapEditor?.isActive('orderedList') ?? false,
        isBlockquoteActive: tiptapEditor?.isActive('blockquote') ?? false,
        isLinkActive: tiptapEditor?.isActive('link') ?? false,
        currentLink: (tiptapEditor?.getAttributes('link')?.href as string) ?? null,
    }

    const EditorComponent = useCallback(
        () => <WebEditorComponent tiptapEditor={tiptapEditor} />,
        [tiptapEditor]
    )

    return { editor, EditorComponent, commands, toolbarState }
}

export function setContentWhenReady(editor: EditorHandle, content: string): () => void {
    editor.setContent(content)
    return () => {}
}
```

- [ ] **Step 3: Create web RichTextEditor component**

```tsx
// packages/mail/components/RichTextEditor.web.tsx
export type { EditorHandle as RichTextEditorHandle } from '~/lib/editor-types'
```

- [ ] **Step 4: Run checks**

Run: `npm run checks`
Expected: May have import errors from consumers — will be fixed in Task 5.

- [ ] **Step 5: Commit**

```bash
git add packages/mail/hooks/useMailEditor.web.ts packages/mail/components/RichTextEditor.web.tsx packages/mail/styles/editor.css
git commit -m "feat: add Tiptap web editor hook for mail compose"
```

---

### Task 5: Update ComposeToolbar to Use Props

**Files:**
- Modify: `packages/mail/components/ComposeToolbar.tsx`

- [ ] **Step 1: Rewrite ComposeToolbar to accept commands/state props**

Replace the entire file. The toolbar no longer imports from `@10play/tentap-editor`:

```tsx
// packages/mail/components/ComposeToolbar.tsx
import {
    Bold,
    Italic,
    Link2,
    List,
    ListOrdered,
    Paperclip,
    Quote,
    Trash2,
    Underline,
} from 'lucide-react-native'
import { useCallback, useMemo } from 'react'
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from 'react-native'
import { ResponsiveToolbar, type ToolbarItem } from '~/components/ResponsiveToolbar'
import type { EditorCommands, EditorToolbarState } from '~/lib/editor-types'
import { useThemeColor } from '~/lib/use-app-theme'

interface ComposeToolbarProps {
    commands: EditorCommands
    toolbarState: EditorToolbarState
    onDiscard: () => void
    onSend: () => void
    onAttach?: () => void
    isPending: boolean
}

export function ComposeToolbar({
    commands,
    toolbarState,
    onDiscard,
    onSend,
    onAttach,
    isPending,
}: ComposeToolbarProps) {
    const iconColor = useThemeColor('muted-foreground')
    const activeColor = useThemeColor('primary')
    const primaryColor = useThemeColor('primary')
    const primaryFgColor = useThemeColor('primary-foreground')
    const borderColor = useThemeColor('border')

    const handleLink = useCallback(() => {
        const defaultUrl = toolbarState.currentLink ?? 'https://'

        if (Platform.OS === 'web') {
            const url = window.prompt('Enter URL:', defaultUrl)
            if (url !== null) {
                if (url) {
                    commands.setLink(url)
                } else {
                    commands.removeLink()
                }
            }
        } else {
            Alert.prompt(
                'Insert Link',
                'Enter URL:',
                url => {
                    if (url !== null) {
                        if (url) {
                            commands.setLink(url)
                        } else {
                            commands.removeLink()
                        }
                    }
                },
                'plain-text',
                defaultUrl
            )
        }
    }, [commands, toolbarState.currentLink])

    const items: ToolbarItem[] = useMemo(
        () => [
            {
                type: 'custom',
                key: 'send',
                element: (
                    <Pressable
                        className="rounded-full items-center"
                        style={[
                            {
                                paddingHorizontal: 20,
                                paddingVertical: 6,
                                minWidth: 72,
                                backgroundColor: primaryColor,
                            },
                            isPending && { opacity: 0.6 },
                        ]}
                        onPress={onSend}
                        disabled={isPending}
                    >
                        {isPending ? (
                            <ActivityIndicator size="small" color={primaryFgColor} />
                        ) : (
                            <Text
                                style={{ fontSize: 14, fontWeight: '600', color: primaryFgColor }}
                            >
                                Send
                            </Text>
                        )}
                    </Pressable>
                ),
            },
            {
                type: 'custom',
                key: 'bold',
                element: (
                    <FormatButton
                        icon={Bold}
                        isActive={toolbarState.isBoldActive}
                        onPress={commands.toggleBold}
                        iconColor={iconColor}
                        activeColor={activeColor}
                    />
                ),
                overflowLabel: 'Bold',
                overflowIcon: Bold,
                overflowPress: commands.toggleBold,
            },
            {
                type: 'custom',
                key: 'italic',
                element: (
                    <FormatButton
                        icon={Italic}
                        isActive={toolbarState.isItalicActive}
                        onPress={commands.toggleItalic}
                        iconColor={iconColor}
                        activeColor={activeColor}
                    />
                ),
                overflowLabel: 'Italic',
                overflowIcon: Italic,
                overflowPress: commands.toggleItalic,
            },
            {
                type: 'custom',
                key: 'underline',
                element: (
                    <FormatButton
                        icon={Underline}
                        isActive={toolbarState.isUnderlineActive}
                        onPress={commands.toggleUnderline}
                        iconColor={iconColor}
                        activeColor={activeColor}
                    />
                ),
                overflowLabel: 'Underline',
                overflowIcon: Underline,
                overflowPress: commands.toggleUnderline,
            },
            { type: 'separator' },
            {
                type: 'custom',
                key: 'bullet-list',
                element: (
                    <FormatButton
                        icon={List}
                        isActive={toolbarState.isBulletListActive}
                        onPress={commands.toggleBulletList}
                        iconColor={iconColor}
                        activeColor={activeColor}
                    />
                ),
                overflowLabel: 'Bullet list',
                overflowIcon: List,
                overflowPress: commands.toggleBulletList,
            },
            {
                type: 'custom',
                key: 'ordered-list',
                element: (
                    <FormatButton
                        icon={ListOrdered}
                        isActive={toolbarState.isOrderedListActive}
                        onPress={commands.toggleOrderedList}
                        iconColor={iconColor}
                        activeColor={activeColor}
                    />
                ),
                overflowLabel: 'Numbered list',
                overflowIcon: ListOrdered,
                overflowPress: commands.toggleOrderedList,
            },
            { type: 'separator' },
            {
                type: 'custom',
                key: 'blockquote',
                element: (
                    <FormatButton
                        icon={Quote}
                        isActive={toolbarState.isBlockquoteActive}
                        onPress={commands.toggleBlockquote}
                        iconColor={iconColor}
                        activeColor={activeColor}
                    />
                ),
                overflowLabel: 'Blockquote',
                overflowIcon: Quote,
                overflowPress: commands.toggleBlockquote,
            },
            {
                type: 'custom',
                key: 'link',
                element: (
                    <FormatButton
                        icon={Link2}
                        isActive={toolbarState.isLinkActive}
                        onPress={handleLink}
                        iconColor={iconColor}
                        activeColor={activeColor}
                    />
                ),
                overflowLabel: 'Link',
                overflowIcon: Link2,
                overflowPress: handleLink,
            },
            { type: 'separator' },
            {
                type: 'button',
                key: 'attach',
                icon: Paperclip,
                label: 'Attach',
                onPress: onAttach ?? (() => {}),
            },
        ],
        [
            primaryColor,
            primaryFgColor,
            isPending,
            onSend,
            commands,
            toolbarState,
            iconColor,
            activeColor,
            handleLink,
            onAttach,
        ]
    )

    const rightItems: ToolbarItem[] = useMemo(
        () => [
            { type: 'button', key: 'discard', icon: Trash2, label: 'Discard', onPress: onDiscard },
        ],
        [onDiscard]
    )

    return (
        <View style={{ borderTopWidth: 1, borderTopColor: borderColor }}>
            <ResponsiveToolbar items={items} rightItems={rightItems} />
        </View>
    )
}

interface FormatButtonProps {
    icon: React.ComponentType<{ size: number; color: string }>
    isActive: boolean
    onPress: () => void
    iconColor: string
    activeColor: string
}

function FormatButton({
    icon: Icon,
    isActive,
    onPress,
    iconColor,
    activeColor,
}: FormatButtonProps) {
    return (
        <Pressable
            className="rounded-md p-1.5"
            style={isActive ? { backgroundColor: `${activeColor}22` } : undefined}
            onPress={onPress}
        >
            <Icon size={16} color={isActive ? activeColor : iconColor} />
        </Pressable>
    )
}
```

- [ ] **Step 2: Run checks**

Run: `npm run checks`
Expected: May still fail — ComposeWindow and InlineReply still pass `editor` prop. Will fix next.

- [ ] **Step 3: Commit**

```bash
git add packages/mail/components/ComposeToolbar.tsx
git commit -m "refactor: ComposeToolbar accepts commands/state props instead of EditorBridge"
```

---

### Task 6: Update ComposeWindow and InlineReply

**Files:**
- Modify: `packages/mail/components/ComposeWindow.tsx`
- Modify: `packages/mail/components/InlineReply.tsx`

- [ ] **Step 1: Update ComposeWindow**

Key changes:
- Import `useMailEditor` still works (resolves to `.web.ts` or `.native.ts` automatically)
- Destructure `{ editor, EditorComponent, commands, toolbarState }` from `useMailEditor()`
- Remove `useEditorHandle` — use `editor` (EditorHandle) directly
- Remove `editorRef` / `RichTextEditorHandle` — use `editor.getHTML()`, `editor.clear()` directly
- Remove `editorBridgeRef` — no longer needed
- Pass `commands`/`toolbarState` to `ComposeToolbar` instead of `editor`
- Render `<EditorComponent />` instead of `<RichTextEditor editor={editor} />`
- `setContentWhenReady` still works (imported from the same hook file)

```tsx
// packages/mail/components/ComposeWindow.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Text, View } from 'react-native'
import { useBreakpoint } from '~/components/workspace/useBreakpoint'
import { captureException } from '~/lib/errors'
import { performMutations } from '~/lib/mutations'
import { useStore } from '~/lib/pocketbase'
import { useThemeColor } from '~/lib/use-app-theme'
import { useForm, zodResolver } from '~/ui/form'
import { composeSchema, parseRecipients } from '../hooks/composeSchema'
import { useAttachments } from '../hooks/useAttachments'
import { useCompose } from '../hooks/useComposeState'
import { useDefaultMailbox } from '../hooks/useDefaultMailbox'
import { setContentWhenReady, useMailEditor } from '../hooks/useMailEditor'
import { useSaveDraft } from '../hooks/useSaveDraft'
import { useSendEmail } from '../hooks/useSendEmail'
import { AttachmentRibbon } from './AttachmentRibbon'
import { ComposeFields } from './ComposeFields'
import { ComposeHeader } from './ComposeHeader'
import { ComposeToolbar } from './ComposeToolbar'

export type { ComposeFormData } from '../hooks/composeSchema'

const webShadow =
    Platform.OS === 'web'
        ? ({ boxShadow: '0 8px 32px rgba(0,0,0,0.24)' } as Record<string, unknown>)
        : {}

interface ComposeWindowProps {
    isVisible: boolean
}

export function ComposeWindow({ isVisible }: ComposeWindowProps) {
    const { mode, replyContext, draftContext, minimize, maximize, open, close } = useCompose()
    const breakpoint = useBreakpoint()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const mailboxId = useDefaultMailbox()
    const draftIdRef = useRef<string | null>(null)
    const [headerTitle, setHeaderTitle] = useState('')
    const { attachments, addFiles, removeFile, clearAll: clearAttachments } = useAttachments()
    const backgroundColor = useThemeColor('background')
    const borderColor = useThemeColor('border')
    const dangerColor = useThemeColor('danger')

    const { editor, EditorComponent, commands, toolbarState } = useMailEditor({
        placeholder: 'Compose email',
    })
    const editorRef = useRef(editor)
    editorRef.current = editor

    const {
        control,
        handleSubmit,
        reset,
        setError,
        getValues,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(composeSchema),
        mode: 'onChange',
        defaultValues: { to: '', cc: '', bcc: '', subject: '' },
    })

    const onSubjectBlur = useCallback(() => setHeaderTitle(getValues('subject')), [getValues])

    useEffect(() => {
        let cleanup: (() => void) | undefined
        if (draftContext) {
            draftIdRef.current = draftContext.messageId
            const formatRecipients = (recipients: { name: string; email: string }[]) =>
                recipients.map(r => (r.name ? `${r.name} <${r.email}>` : r.email)).join(', ')
            reset({
                to: formatRecipients(draftContext.to),
                cc: formatRecipients(draftContext.cc),
                bcc: formatRecipients(draftContext.bcc),
                subject: draftContext.subject,
            })
            setHeaderTitle(draftContext.subject)
            cleanup = setContentWhenReady(
                editorRef.current,
                draftContext.htmlBody || draftContext.textBody || ''
            )
        } else if (replyContext) {
            draftIdRef.current = null
            const toValue =
                replyContext.to.map(r => (r.name ? `${r.name} <${r.email}>` : r.email)).join(', ') +
                (replyContext.to.length > 0 ? ', ' : '')
            const subjectPrefix = replyContext.subject.startsWith('Re:')
                ? replyContext.subject
                : `Re: ${replyContext.subject}`
            reset({ to: toValue, cc: '', bcc: '', subject: subjectPrefix })
            setHeaderTitle(subjectPrefix)
        } else {
            draftIdRef.current = null
            reset({ to: '', cc: '', bcc: '', subject: '' })
            setHeaderTitle('')
        }
        return () => cleanup?.()
    }, [replyContext, draftContext, reset])

    const [messagesCollection] = useStore('mail_messages')

    const deleteDraftMessage = async () => {
        const id = draftIdRef.current
        if (!id) return
        draftIdRef.current = null
        await performMutations(function* () {
            yield messagesCollection.delete(id)
        })
    }

    const { send, isPending } = useSendEmail({
        onSuccess: async () => {
            await deleteDraftMessage()
            editor.clear()
            clearAttachments()
            reset({ to: '', cc: '', bcc: '', subject: '' })
            close()
        },
    })

    const { saveDraft } = useSaveDraft()

    const handleClose = async () => {
        const text = await editor.getText()
        if (!text?.trim() || !mailboxId) {
            close()
            return
        }

        const data = getValues()
        const htmlBody = await editor.getHTML()
        const to = data.to ? parseRecipients(data.to) : undefined
        const cc = data.cc ? parseRecipients(data.cc) : undefined
        const bcc = data.bcc ? parseRecipients(data.bcc) : undefined

        saveDraft({
            mailbox_id: mailboxId,
            message_id: draftIdRef.current ?? undefined,
            to,
            cc,
            bcc,
            subject: data.subject,
            html_body: htmlBody,
            text_body: text,
            attachments: attachments.map(a => a.file),
        })

        draftIdRef.current = null
        editor.clear()
        clearAttachments()
        reset({ to: '', cc: '', bcc: '', subject: '' })
        close()
    }

    if (!isVisible) return null

    const isMinimized = mode === 'minimized'
    const isMaximized = mode === 'maximized'
    const isNotDesktop = breakpoint !== 'desktop'
    const hasMailbox = mailboxId != null

    const modeStyles = {
        open: { bottom: 0, right: 16, width: 500, height: 560 },
        minimized: { bottom: 0, right: 16, width: 300, height: 40 },
        maximized: {
            position: 'relative' as const,
            width: '75%' as const,
            maxWidth: 900,
            height: '85%' as const,
            maxHeight: 800,
        },
        closed: { bottom: 0, right: 16, width: 500, height: 560 },
        inline: { bottom: 0, right: 16, width: 500, height: 560 },
    }

    const fullscreenStyle = { top: 0, left: 0, right: 0, bottom: 0 }
    const windowStyle = isNotDesktop ? fullscreenStyle : modeStyles[mode]

    const onSend = handleSubmit(async data => {
        if (!mailboxId) {
            setError('to', { message: 'No mailbox configured — contact your admin' })
            return
        }

        const htmlBody = await editor.getHTML()
        const textBody = await editor.getText()

        const cc = data.cc ? parseRecipients(data.cc) : undefined
        const bcc = data.bcc ? parseRecipients(data.bcc) : undefined

        send({
            mailbox_id: mailboxId,
            to: parseRecipients(data.to),
            cc,
            bcc,
            subject: data.subject,
            html_body: htmlBody,
            text_body: textBody,
            in_reply_to_message_id: replyContext?.messageId,
            attachments: attachments.map(a => a.file),
        })
    })

    const handleAttach = () => {
        fileInputRef.current?.click()
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files?.length) return
        try {
            addFiles(Array.from(files))
        } catch (err) {
            captureException('Failed to add attachments', err)
        }
        e.target.value = ''
    }

    const composeWindow = (
        <View
            className="absolute border rounded-lg"
            style={[
                {
                    zIndex: 1000,
                    backgroundColor,
                    borderColor,
                },
                windowStyle,
                webShadow,
            ]}
        >
            <ComposeHeader
                mode={mode}
                title={headerTitle}
                onMinimize={isMinimized ? open : minimize}
                onMaximize={isMaximized ? open : maximize}
                onClose={handleClose}
            />
            <View className={isMinimized ? 'hidden' : 'flex-1'}>
                <ComposeFields control={control} errors={errors} onSubjectBlur={onSubjectBlur} />
                {hasMailbox ? null : (
                    <View className="px-3 py-1.5">
                        <Text style={{ fontSize: 12, color: dangerColor }}>
                            No mailbox found. Ask your admin to add you to a mailbox.
                        </Text>
                    </View>
                )}
                <View className="flex-1 p-3">
                    <EditorComponent />
                </View>
                <AttachmentRibbon
                    isVisible={attachments.length > 0}
                    attachments={attachments}
                    onRemove={removeFile}
                />
                {Platform.OS === 'web' && (
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                    />
                )}
                <ComposeToolbar
                    commands={commands}
                    toolbarState={toolbarState}
                    onDiscard={close}
                    onSend={onSend}
                    onAttach={handleAttach}
                    isPending={isPending}
                />
            </View>
        </View>
    )

    const showBackdrop = isMaximized && !isNotDesktop

    return (
        <View
            className="absolute top-0 left-0 right-0 bottom-0"
            style={{
                zIndex: 1000,
                alignItems: showBackdrop ? 'center' : undefined,
                justifyContent: showBackdrop ? 'center' : undefined,
                backgroundColor: showBackdrop ? 'rgba(0,0,0,0.3)' : undefined,
            }}
            pointerEvents={showBackdrop ? 'auto' : 'box-none'}
        >
            {composeWindow}
        </View>
    )
}
```

- [ ] **Step 2: Update InlineReply**

Key changes same as ComposeWindow — destructure from `useMailEditor()`, use `editor` directly, pass `commands`/`toolbarState` to toolbar, render `<EditorComponent />`:

```tsx
// packages/mail/components/InlineReply.tsx
import { Forward, Reply, ReplyAll } from 'lucide-react-native'
import { Platform, Pressable, Text, View } from 'react-native'
import { useRef } from 'react'
import { useBreakpoint } from '~/components/workspace/useBreakpoint'
import { captureException } from '~/lib/errors'
import { useThemeColor } from '~/lib/use-app-theme'
import { useForm, zodResolver } from '~/ui/form'
import { composeSchema, parseRecipients } from '../hooks/composeSchema'
import { useAttachments } from '../hooks/useAttachments'
import { useCompose } from '../hooks/useComposeState'
import { useDefaultMailbox } from '../hooks/useDefaultMailbox'
import { useMailEditor } from '../hooks/useMailEditor'
import { useSendEmail } from '../hooks/useSendEmail'
import { AttachmentRibbon } from './AttachmentRibbon'
import { ComposeFields } from './ComposeFields'
import { ComposeToolbar } from './ComposeToolbar'

interface InlineReplyProps {
    messageId: string
    threadId: string
    subject: string
    senderName: string
    senderEmail: string
    recipientsTo: { name: string; email: string }[]
    recipientsCc: { name: string; email: string }[]
}

export function InlineReply({
    messageId,
    threadId,
    subject,
    senderName,
    senderEmail,
    recipientsTo,
    recipientsCc,
}: InlineReplyProps) {
    const mutedColor = useThemeColor('muted-foreground')
    const borderColor = useThemeColor('border')
    const breakpoint = useBreakpoint()
    const isMobile = breakpoint === 'mobile'
    const { mode, replyContext, openReply, close } = useCompose()

    const isInlineActive = mode === 'inline' && replyContext?.threadId === threadId

    const handleReply = () => {
        openReply({
            messageId,
            threadId,
            subject,
            to: [{ name: senderName, email: senderEmail }],
        })
    }

    const handleReplyAll = () => {
        const allRecipients = [
            { name: senderName, email: senderEmail },
            ...recipientsTo,
            ...recipientsCc,
        ]
        openReply({
            messageId,
            threadId,
            subject,
            to: allRecipients,
        })
    }

    const handleForward = () => {
        openReply({
            messageId,
            threadId,
            subject: `Fwd: ${subject}`,
            to: [],
        })
    }

    if (isInlineActive) {
        const formKey = `${replyContext.messageId}-${replyContext.to.length}`
        return <InlineComposeForm key={formKey} replyContext={replyContext} onClose={close} />
    }

    return (
        <View
            className="flex-row gap-2 p-4"
            style={{
                borderTopWidth: 1,
                borderTopColor: borderColor,
                flexWrap: isMobile ? 'wrap' : undefined,
            }}
        >
            <Pressable
                className="flex-row items-center px-4 py-2 rounded-full border"
                style={{ gap: 6, borderColor }}
                onPress={handleReply}
            >
                <Reply size={16} color={mutedColor} />
                <Text style={{ fontSize: 13, fontWeight: '500', color: mutedColor }}>Reply</Text>
            </Pressable>
            <Pressable
                className="flex-row items-center px-4 py-2 rounded-full border"
                style={{ gap: 6, borderColor }}
                onPress={handleReplyAll}
            >
                <ReplyAll size={16} color={mutedColor} />
                <Text style={{ fontSize: 13, fontWeight: '500', color: mutedColor }}>
                    Reply all
                </Text>
            </Pressable>
            <Pressable
                className="flex-row items-center px-4 py-2 rounded-full border"
                style={{ gap: 6, borderColor }}
                onPress={handleForward}
            >
                <Forward size={16} color={mutedColor} />
                <Text style={{ fontSize: 13, fontWeight: '500', color: mutedColor }}>Forward</Text>
            </Pressable>
        </View>
    )
}

function InlineComposeForm({
    replyContext,
    onClose,
}: {
    replyContext: NonNullable<ReturnType<typeof useCompose>['replyContext']>
    onClose: () => void
}) {
    const borderColor = useThemeColor('border')
    const backgroundColor = useThemeColor('background')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const mailboxId = useDefaultMailbox()
    const { editor, EditorComponent, commands, toolbarState } = useMailEditor({
        placeholder: 'Compose reply',
    })
    const { attachments, addFiles, removeFile, clearAll: clearAttachments } = useAttachments()

    const toValue =
        replyContext.to.map(r => (r.name ? `${r.name} <${r.email}>` : r.email)).join(', ') +
        (replyContext.to.length > 0 ? ', ' : '')
    const subjectValue = replyContext.subject.startsWith('Re:')
        ? replyContext.subject
        : `Re: ${replyContext.subject}`

    const {
        control,
        handleSubmit,
        reset,
        setError,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(composeSchema),
        mode: 'onChange',
        defaultValues: { to: toValue, cc: '', bcc: '', subject: subjectValue },
    })

    const { send, isPending } = useSendEmail({
        onSuccess: () => {
            editor.clear()
            clearAttachments()
            reset({ to: '', cc: '', bcc: '', subject: '' })
            onClose()
        },
    })

    const onSend = handleSubmit(async data => {
        if (!mailboxId) {
            setError('to', { message: 'No mailbox configured — contact your admin' })
            return
        }

        const htmlBody = await editor.getHTML()
        const textBody = await editor.getText()

        const cc = data.cc ? parseRecipients(data.cc) : undefined
        const bcc = data.bcc ? parseRecipients(data.bcc) : undefined

        send({
            mailbox_id: mailboxId,
            to: parseRecipients(data.to),
            cc,
            bcc,
            subject: data.subject,
            html_body: htmlBody,
            text_body: textBody,
            in_reply_to_message_id: replyContext.messageId,
            attachments: attachments.map(a => a.file),
        })
    })

    const handleAttach = () => {
        fileInputRef.current?.click()
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files?.length) return
        try {
            addFiles(Array.from(files))
        } catch (err) {
            captureException('Failed to add attachments', err)
        }
        e.target.value = ''
    }

    return (
        <View
            className="m-4 border rounded-lg"
            style={{
                minHeight: 200,
                borderColor,
                backgroundColor,
            }}
        >
            <ComposeFields control={control} errors={errors} />
            <View className="flex-1 p-3" style={{ minHeight: 120 }}>
                <EditorComponent />
            </View>
            <AttachmentRibbon
                isVisible={attachments.length > 0}
                attachments={attachments}
                onRemove={removeFile}
            />
            {Platform.OS === 'web' && (
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                />
            )}
            <ComposeToolbar
                commands={commands}
                toolbarState={toolbarState}
                onDiscard={onClose}
                onSend={onSend}
                onAttach={handleAttach}
                isPending={isPending}
            />
        </View>
    )
}
```

- [ ] **Step 3: Run checks**

Run: `npm run checks`
Expected: PASS for mail package. The docs package may still have issues (next task).

- [ ] **Step 4: Commit**

```bash
git add packages/mail/components/ComposeWindow.tsx packages/mail/components/InlineReply.tsx
git commit -m "refactor: ComposeWindow and InlineReply use unified EditorResult API"
```

---

### Task 7: Document Editor — Platform Split

**Files:**
- Rename: `packages/docs/hooks/useDocumentEditor.ts` → `packages/docs/hooks/useDocumentEditor.native.ts`
- Rename: `packages/docs/components/DocumentEditor.tsx` → `packages/docs/components/DocumentEditor.native.tsx`
- Create: `packages/docs/hooks/useDocumentEditor.web.ts`
- Create: `packages/docs/components/DocumentEditor.web.tsx`
- Modify: `packages/docs/components/DocumentToolbar.tsx`

- [ ] **Step 1: Rename native files**

```bash
git mv packages/docs/hooks/useDocumentEditor.ts packages/docs/hooks/useDocumentEditor.native.ts
git mv packages/docs/components/DocumentEditor.tsx packages/docs/components/DocumentEditor.native.tsx
```

- [ ] **Step 2: Update native doc editor hook to return EditorResult**

Same pattern as Task 3 but with HeadingBridge included. Rewrite `packages/docs/hooks/useDocumentEditor.native.ts`:

```ts
// packages/docs/hooks/useDocumentEditor.native.ts
import {
    BlockquoteBridge,
    BoldBridge,
    BulletListBridge,
    CoreBridge,
    DropCursorBridge,
    type EditorBridge,
    HardBreakBridge,
    HeadingBridge,
    HistoryBridge,
    ItalicBridge,
    LinkBridge,
    OrderedListBridge,
    PlaceholderBridge,
    RichText,
    UnderlineBridge,
    useBridgeState,
    useEditorBridge,
} from '@10play/tentap-editor'
import { useCallback, useMemo } from 'react'
import { View } from 'react-native'
import type {
    EditorCommands,
    EditorHandle,
    EditorResult,
    EditorToolbarState,
} from '~/lib/editor-types'
import { useThemeColor } from '~/lib/use-app-theme'

function buildEditorCSS(colors: { bg: string; fg: string; placeholder: string; primary: string }) {
    return `
        * {
            background-color: ${colors.bg};
            color: ${colors.fg};
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .ProseMirror {
            padding: 24px 32px;
            min-height: 100%;
            font-size: 15px;
            line-height: 1.7;
            max-width: 800px;
            margin: 0 auto;
        }
        .ProseMirror:focus {
            outline: none;
        }
        .is-editor-empty:first-child::before {
            color: ${colors.placeholder};
            content: attr(data-placeholder);
            float: left;
            height: 0;
            pointer-events: none;
        }
        h1 { font-size: 2em; font-weight: 700; margin: 1em 0 0.5em; }
        h2 { font-size: 1.5em; font-weight: 600; margin: 0.8em 0 0.4em; }
        h3 { font-size: 1.25em; font-weight: 600; margin: 0.6em 0 0.3em; }
        blockquote {
            border-left: 3px solid ${colors.placeholder};
            padding-left: 1rem;
            margin-left: 0;
            color: ${colors.placeholder};
        }
        a {
            color: ${colors.primary};
            text-decoration: underline;
        }
        ul, ol {
            padding-left: 1.5rem;
        }
    `
}

const baseBridgeExtensions = [
    BoldBridge,
    ItalicBridge,
    UnderlineBridge,
    HeadingBridge,
    BulletListBridge,
    OrderedListBridge,
    BlockquoteBridge,
    LinkBridge,
    HistoryBridge,
    HardBreakBridge,
    DropCursorBridge,
]

interface UseDocumentEditorOptions {
    initialContent?: string
    editable?: boolean
}

function NativeDocEditorComponent({ bridge }: { bridge: EditorBridge }) {
    return (
        <View className="flex-1">
            <RichText editor={bridge} scrollEnabled />
        </View>
    )
}

export function useDocumentEditor(options: UseDocumentEditorOptions = {}): EditorResult {
    const bgColor = useThemeColor('background')
    const fgColor = useThemeColor('foreground')
    const placeholderColor = useThemeColor('field-placeholder')
    const primaryColor = useThemeColor('primary')
    const editable = options.editable ?? true

    const bridgeExtensions = useMemo(() => {
        const css = buildEditorCSS({
            bg: bgColor,
            fg: fgColor,
            placeholder: placeholderColor,
            primary: primaryColor,
        })
        return [
            CoreBridge.configureCSS(css),
            ...baseBridgeExtensions,
            PlaceholderBridge.configureExtension({ placeholder: 'Start writing...' }),
        ]
    }, [bgColor, fgColor, placeholderColor, primaryColor])

    const editorTheme = useMemo(() => ({ webview: { backgroundColor: bgColor } }), [bgColor])

    const bridge = useEditorBridge({
        initialContent: options.initialContent,
        bridgeExtensions,
        theme: editorTheme,
        editable,
    })

    const editorState = useBridgeState(bridge)

    const editor: EditorHandle = useMemo(
        () => ({
            getHTML: () => bridge.getHTML(),
            getText: () => bridge.getText(),
            setContent: (html: string) => bridge.setContent(html),
            focus: (position?: 'start' | 'end') => bridge.focus(position ?? 'end'),
            clear: () => bridge.setContent(''),
        }),
        [bridge]
    )

    const commands: EditorCommands = useMemo(
        () => ({
            toggleBold: () => bridge.toggleBold(),
            toggleItalic: () => bridge.toggleItalic(),
            toggleUnderline: () => bridge.toggleUnderline(),
            toggleBulletList: () => bridge.toggleBulletList(),
            toggleOrderedList: () => bridge.toggleOrderedList(),
            toggleBlockquote: () => bridge.toggleBlockquote(),
            toggleHeading: (level: number) => bridge.toggleHeading(level),
            setLink: (url: string) => bridge.setLink(url),
            removeLink: () => bridge.setLink(''),
            undo: () => bridge.undo(),
            redo: () => bridge.redo(),
        }),
        [bridge]
    )

    const toolbarState: EditorToolbarState = {
        isBoldActive: editorState.isBoldActive,
        isItalicActive: editorState.isItalicActive,
        isUnderlineActive: editorState.isUnderlineActive,
        isBulletListActive: editorState.isBulletListActive,
        isOrderedListActive: editorState.isOrderedListActive,
        isBlockquoteActive: editorState.isBlockquoteActive,
        isLinkActive: editorState.isLinkActive,
        currentLink: editorState.activeLink ?? null,
    }

    const EditorComponent = useCallback(
        () => <NativeDocEditorComponent bridge={bridge} />,
        [bridge]
    )

    return { editor, EditorComponent, commands, toolbarState }
}
```

- [ ] **Step 3: Update native DocumentEditor component**

```tsx
// packages/docs/components/DocumentEditor.native.tsx
export type { EditorHandle as DocumentEditorHandle } from '~/lib/editor-types'
```

- [ ] **Step 4: Create web doc editor hook**

```ts
// packages/docs/hooks/useDocumentEditor.web.ts
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useCallback, useMemo } from 'react'
import { View } from 'react-native'
import type {
    EditorCommands,
    EditorHandle,
    EditorResult,
    EditorToolbarState,
} from '~/lib/editor-types'
import { useThemeColor } from '~/lib/use-app-theme'

interface UseDocumentEditorOptions {
    initialContent?: string
    editable?: boolean
}

function WebDocEditorComponent({ tiptapEditor }: { tiptapEditor: ReturnType<typeof useEditor> }) {
    const bgColor = useThemeColor('background')
    const fgColor = useThemeColor('foreground')
    const placeholderColor = useThemeColor('field-placeholder')
    const primaryColor = useThemeColor('primary')

    return (
        <View
            className="flex-1 tinycld-doc-editor"
            style={
                {
                    '--editor-placeholder-color': placeholderColor,
                    '--editor-primary-color': primaryColor,
                    backgroundColor: bgColor,
                    color: fgColor,
                } as React.CSSProperties
            }
        >
            <EditorContent editor={tiptapEditor} style={{ flex: 1 }} />
        </View>
    )
}

export function useDocumentEditor(options: UseDocumentEditorOptions = {}): EditorResult {
    const tiptapEditor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            Link.configure({ openOnClick: false }),
            Placeholder.configure({ placeholder: 'Start writing...' }),
        ],
        content: options.initialContent ?? '',
        editable: options.editable ?? true,
    })

    const editor: EditorHandle = useMemo(
        () => ({
            getHTML: () => Promise.resolve(tiptapEditor?.getHTML() ?? ''),
            getText: () => Promise.resolve(tiptapEditor?.getText() ?? ''),
            setContent: (html: string) => tiptapEditor?.commands.setContent(html),
            focus: (position?: 'start' | 'end') => {
                if (position === 'start') {
                    tiptapEditor?.commands.focus('start')
                } else {
                    tiptapEditor?.commands.focus('end')
                }
            },
            clear: () => tiptapEditor?.commands.clearContent(),
        }),
        [tiptapEditor]
    )

    const commands: EditorCommands = useMemo(
        () => ({
            toggleBold: () => tiptapEditor?.chain().focus().toggleBold().run(),
            toggleItalic: () => tiptapEditor?.chain().focus().toggleItalic().run(),
            toggleUnderline: () => tiptapEditor?.chain().focus().toggleUnderline().run(),
            toggleBulletList: () => tiptapEditor?.chain().focus().toggleBulletList().run(),
            toggleOrderedList: () => tiptapEditor?.chain().focus().toggleOrderedList().run(),
            toggleBlockquote: () => tiptapEditor?.chain().focus().toggleBlockquote().run(),
            toggleHeading: (level: number) =>
                tiptapEditor?.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run(),
            setLink: (url: string) => {
                if (url) {
                    tiptapEditor?.chain().focus().setLink({ href: url }).run()
                } else {
                    tiptapEditor?.chain().focus().unsetLink().run()
                }
            },
            removeLink: () => tiptapEditor?.chain().focus().unsetLink().run(),
            undo: () => tiptapEditor?.chain().focus().undo().run(),
            redo: () => tiptapEditor?.chain().focus().redo().run(),
        }),
        [tiptapEditor]
    )

    const toolbarState: EditorToolbarState = {
        isBoldActive: tiptapEditor?.isActive('bold') ?? false,
        isItalicActive: tiptapEditor?.isActive('italic') ?? false,
        isUnderlineActive: tiptapEditor?.isActive('underline') ?? false,
        isBulletListActive: tiptapEditor?.isActive('bulletList') ?? false,
        isOrderedListActive: tiptapEditor?.isActive('orderedList') ?? false,
        isBlockquoteActive: tiptapEditor?.isActive('blockquote') ?? false,
        isLinkActive: tiptapEditor?.isActive('link') ?? false,
        currentLink: (tiptapEditor?.getAttributes('link')?.href as string) ?? null,
    }

    const EditorComponent = useCallback(
        () => <WebDocEditorComponent tiptapEditor={tiptapEditor} />,
        [tiptapEditor]
    )

    return { editor, EditorComponent, commands, toolbarState }
}
```

- [ ] **Step 5: Create web DocumentEditor component**

```tsx
// packages/docs/components/DocumentEditor.web.tsx
export type { EditorHandle as DocumentEditorHandle } from '~/lib/editor-types'
```

- [ ] **Step 6: Add doc editor CSS to the existing editor.css or create a docs-specific one**

Append to `packages/mail/styles/editor.css` or create `packages/docs/styles/editor.css`:

```css
/* packages/docs/styles/editor.css */
.tinycld-doc-editor .ProseMirror {
    padding: 24px 32px;
    min-height: 100%;
    font-size: 15px;
    line-height: 1.7;
    max-width: 800px;
    margin: 0 auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    outline: none;
    flex: 1;
}

.tinycld-doc-editor .ProseMirror p.is-editor-empty:first-child::before {
    color: var(--editor-placeholder-color, #aaa);
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
}

.tinycld-doc-editor .ProseMirror h1 { font-size: 2em; font-weight: 700; margin: 1em 0 0.5em; }
.tinycld-doc-editor .ProseMirror h2 { font-size: 1.5em; font-weight: 600; margin: 0.8em 0 0.4em; }
.tinycld-doc-editor .ProseMirror h3 { font-size: 1.25em; font-weight: 600; margin: 0.6em 0 0.3em; }

.tinycld-doc-editor .ProseMirror blockquote {
    border-left: 3px solid var(--editor-placeholder-color, #aaa);
    padding-left: 1rem;
    margin-left: 0;
    color: var(--editor-placeholder-color, #aaa);
}

.tinycld-doc-editor .ProseMirror a {
    color: var(--editor-primary-color, #0066cc);
    text-decoration: underline;
}

.tinycld-doc-editor .ProseMirror ul,
.tinycld-doc-editor .ProseMirror ol {
    padding-left: 1.5rem;
}
```

Import this CSS in `useDocumentEditor.web.ts` by adding `import '../styles/editor.css'` at the top.

- [ ] **Step 7: Update DocumentToolbar to use commands/state props**

```tsx
// packages/docs/components/DocumentToolbar.tsx
import {
    ArrowLeft,
    Bold,
    Heading1,
    Heading2,
    Italic,
    Link,
    List,
    ListOrdered,
    Quote,
    Underline,
} from 'lucide-react-native'
import { useMemo } from 'react'
import { Pressable } from 'react-native'
import { ResponsiveToolbar, type ToolbarItem } from '~/components/ResponsiveToolbar'
import type { EditorCommands } from '~/lib/editor-types'
import { useThemeColor } from '~/lib/use-app-theme'

interface DocumentToolbarProps {
    commands: EditorCommands
    onBack: () => void
}

export function DocumentToolbar({ commands, onBack }: DocumentToolbarProps) {
    const foreground = useThemeColor('foreground')

    const items: ToolbarItem[] = useMemo(
        () => [
            {
                type: 'custom',
                key: 'back',
                element: (
                    <Pressable onPress={onBack} className="p-2 rounded-md">
                        <ArrowLeft size={20} color={foreground} />
                    </Pressable>
                ),
                overflowLabel: 'Back',
                overflowIcon: ArrowLeft,
                overflowPress: onBack,
            },
            { type: 'separator' },
            {
                type: 'button',
                key: 'bold',
                icon: Bold,
                label: 'Bold',
                onPress: commands.toggleBold,
            },
            {
                type: 'button',
                key: 'italic',
                icon: Italic,
                label: 'Italic',
                onPress: commands.toggleItalic,
            },
            {
                type: 'button',
                key: 'underline',
                icon: Underline,
                label: 'Underline',
                onPress: commands.toggleUnderline,
            },
            { type: 'separator' },
            {
                type: 'button',
                key: 'h1',
                icon: Heading1,
                label: 'Heading 1',
                onPress: () => commands.toggleHeading(1),
            },
            {
                type: 'button',
                key: 'h2',
                icon: Heading2,
                label: 'Heading 2',
                onPress: () => commands.toggleHeading(2),
            },
            { type: 'separator' },
            {
                type: 'button',
                key: 'bullet-list',
                icon: List,
                label: 'Bullet list',
                onPress: commands.toggleBulletList,
            },
            {
                type: 'button',
                key: 'ordered-list',
                icon: ListOrdered,
                label: 'Numbered list',
                onPress: commands.toggleOrderedList,
            },
            {
                type: 'button',
                key: 'blockquote',
                icon: Quote,
                label: 'Blockquote',
                onPress: commands.toggleBlockquote,
            },
            {
                type: 'button',
                key: 'link',
                icon: Link,
                label: 'Link',
                onPress: () => commands.setLink('https://'),
            },
        ],
        [commands, onBack, foreground]
    )

    return <ResponsiveToolbar items={items} />
}
```

- [ ] **Step 8: Update DocumentEditor consumers**

Find where `DocumentEditor` and `useDocumentEditor` are used in screens and update them to destructure `EditorResult` and pass `commands` to `DocumentToolbar`. Check `packages/docs/screens/` for the consumer.

- [ ] **Step 9: Run checks**

Run: `npm run checks`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add packages/docs/
git commit -m "feat: platform-split document editor with Tiptap on web, TenTap on native"
```

---

### Task 8: Image URL Proxy Utility + Tests

**Files:**
- Create: `lib/proxy-image-urls.ts`
- Create: `lib/__tests__/proxy-image-urls.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/__tests__/proxy-image-urls.test.ts
import { describe, expect, it } from 'vitest'
import { proxyImageUrls } from '../proxy-image-urls'

describe('proxyImageUrls', () => {
    it('rewrites https image URLs', () => {
        const html = '<img src="https://example.com/photo.jpg" alt="test">'
        const result = proxyImageUrls(html)
        expect(result).toBe(
            '<img src="/api/mail/image-proxy?url=https%3A%2F%2Fexample.com%2Fphoto.jpg" alt="test">'
        )
    })

    it('rewrites http image URLs', () => {
        const html = '<img src="http://example.com/photo.jpg">'
        const result = proxyImageUrls(html)
        expect(result).toContain('/api/mail/image-proxy?url=http%3A%2F%2Fexample.com%2Fphoto.jpg')
    })

    it('preserves cid: URLs', () => {
        const html = '<img src="cid:image001@example.com">'
        const result = proxyImageUrls(html)
        expect(result).toBe(html)
    })

    it('preserves data: URLs', () => {
        const html = '<img src="data:image/png;base64,abc123">'
        const result = proxyImageUrls(html)
        expect(result).toBe(html)
    })

    it('handles multiple images', () => {
        const html = '<img src="https://a.com/1.jpg"><img src="cid:x"><img src="https://b.com/2.png">'
        const result = proxyImageUrls(html)
        expect(result).toContain('/api/mail/image-proxy?url=https%3A%2F%2Fa.com%2F1.jpg')
        expect(result).toContain('src="cid:x"')
        expect(result).toContain('/api/mail/image-proxy?url=https%3A%2F%2Fb.com%2F2.png')
    })

    it('handles single and double quotes', () => {
        const html = `<img src='https://example.com/photo.jpg'>`
        const result = proxyImageUrls(html)
        expect(result).toContain('/api/mail/image-proxy?url=https%3A%2F%2Fexample.com%2Fphoto.jpg')
    })

    it('returns empty string for empty input', () => {
        expect(proxyImageUrls('')).toBe('')
    })

    it('passes through HTML with no images', () => {
        const html = '<p>Hello world</p>'
        expect(proxyImageUrls(html)).toBe(html)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- lib/__tests__/proxy-image-urls.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement proxyImageUrls**

```ts
// lib/proxy-image-urls.ts

export function proxyImageUrls(html: string): string {
    if (!html) return html
    return html.replace(
        /(<img[^>]+src=["'])(?!cid:)(?!data:)(https?:\/\/[^"']+)(["'])/gi,
        (_, prefix, url, suffix) =>
            `${prefix}/api/mail/image-proxy?url=${encodeURIComponent(url)}${suffix}`
    )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- lib/__tests__/proxy-image-urls.test.ts`
Expected: PASS

- [ ] **Step 5: Run full checks**

Run: `npm run checks`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/proxy-image-urls.ts lib/__tests__/proxy-image-urls.test.ts
git commit -m "feat: add proxyImageUrls utility for email image proxying"
```

---

### Task 9: Update EmailBody to Proxy Images

**Files:**
- Modify: `packages/mail/components/EmailBody.tsx`

- [ ] **Step 1: Add proxyImageUrls to EmailBody**

```tsx
// packages/mail/components/EmailBody.tsx
import { useEffect, useState } from 'react'
import { Platform, Text, View } from 'react-native'
import { proxyImageUrls } from '~/lib/proxy-image-urls'
import { pb } from '~/lib/pocketbase'

interface EmailBodyProps {
    collectionId: string
    recordId: string
    filename: string
}

function useEmailHtml(collectionId: string, recordId: string, filename: string) {
    const [html, setHtml] = useState('')

    useEffect(() => {
        if (!filename) return

        const url = pb.files.getURL({ collectionId, id: recordId }, filename)
        fetch(url)
            .then(res => res.text())
            .then(raw => setHtml(proxyImageUrls(raw)))
            .catch(() => setHtml(''))
    }, [collectionId, recordId, filename])

    return html
}

export function EmailBody({ collectionId, recordId, filename }: EmailBodyProps) {
    const html = useEmailHtml(collectionId, recordId, filename)

    if (!filename) return null

    if (Platform.OS === 'web') {
        return (
            <View className="p-4 flex-1 rounded-lg" style={{ backgroundColor: '#fff' }}>
                <iframe
                    sandbox=""
                    srcDoc={html}
                    style={{
                        border: 'none',
                        width: '100%',
                        minHeight: 300,
                        flex: 1,
                        colorScheme: 'light',
                    }}
                    title="Email body"
                />
            </View>
        )
    }

    return (
        <View className="p-4 flex-1 rounded-lg" style={{ backgroundColor: '#fff' }}>
            <Text style={{ fontSize: 14, lineHeight: 22, color: '#000' }}>
                {html.replace(/<[^>]*>/g, '')}
            </Text>
        </View>
    )
}
```

- [ ] **Step 2: Run checks**

Run: `npm run checks`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/mail/components/EmailBody.tsx
git commit -m "feat: proxy external email images through server before rendering"
```

---

### Task 10: Image Proxy Go Endpoint

**Files:**
- Create: `packages/mail/server/endpoints_image_proxy.go`
- Create: `packages/mail/server/endpoints_image_proxy_test.go`
- Modify: `packages/mail/server/register.go`

- [ ] **Step 1: Write the test file**

```go
// packages/mail/server/endpoints_image_proxy_test.go
package mail

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIsPrivateIP(t *testing.T) {
	tests := []struct {
		host    string
		private bool
	}{
		{"127.0.0.1", true},
		{"10.0.0.1", true},
		{"172.16.0.1", true},
		{"192.168.1.1", true},
		{"169.254.1.1", true},
		{"::1", true},
		{"0.0.0.0", true},
		{"8.8.8.8", false},
		{"example.com", false},
	}

	for _, tt := range tests {
		got := isPrivateHost(tt.host)
		if got != tt.private {
			t.Errorf("isPrivateHost(%q) = %v, want %v", tt.host, got, tt.private)
		}
	}
}

func TestProxyRejectsNoURL(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/mail/image-proxy", nil)
	rr := httptest.NewRecorder()
	handleImageProxy(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestProxyRejectsFTPScheme(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/mail/image-proxy?url=ftp://example.com/file.jpg", nil)
	rr := httptest.NewRecorder()
	handleImageProxy(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestProxyRejectsPrivateIP(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/mail/image-proxy?url=http://127.0.0.1/secret.jpg", nil)
	rr := httptest.NewRecorder()
	handleImageProxy(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", rr.Code)
	}
}

func TestProxyFetchesExternalImage(t *testing.T) {
	// Spin up a test server that returns a 1x1 PNG
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		w.Write([]byte{0x89, 0x50, 0x4E, 0x47}) // PNG magic bytes
	}))
	defer ts.Close()

	req := httptest.NewRequest("GET", "/api/mail/image-proxy?url="+ts.URL+"/img.png", nil)
	rr := httptest.NewRecorder()
	handleImageProxy(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); ct != "image/png" {
		t.Errorf("expected Content-Type image/png, got %s", ct)
	}
	if cc := rr.Header().Get("Cache-Control"); cc == "" {
		t.Error("expected Cache-Control header")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/mail/server && go test -run TestProxy -v`
Expected: FAIL — `handleImageProxy` not defined

- [ ] **Step 3: Implement the image proxy endpoint**

```go
// packages/mail/server/endpoints_image_proxy.go
package mail

import (
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	maxImageSize    = 10 << 20 // 10 MB
	cacheTTL        = 1 * time.Hour
	maxCacheEntries = 500
)

type cacheEntry struct {
	data        []byte
	contentType string
	expiresAt   time.Time
}

var (
	imageCache   = make(map[string]*cacheEntry)
	imageCacheMu sync.RWMutex
)

var proxyClient = &http.Client{
	Timeout: 15 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 3 {
			return http.ErrUseLastResponse
		}
		return nil
	},
}

func handleImageProxy(w http.ResponseWriter, r *http.Request) {
	rawURL := r.URL.Query().Get("url")
	if rawURL == "" {
		http.Error(w, "missing url parameter", http.StatusBadRequest)
		return
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		http.Error(w, "invalid url", http.StatusBadRequest)
		return
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		http.Error(w, "only http/https URLs allowed", http.StatusBadRequest)
		return
	}

	host := parsed.Hostname()
	if isPrivateHost(host) {
		http.Error(w, "private addresses not allowed", http.StatusForbidden)
		return
	}

	// Check cache
	imageCacheMu.RLock()
	if entry, ok := imageCache[rawURL]; ok && time.Now().Before(entry.expiresAt) {
		imageCacheMu.RUnlock()
		w.Header().Set("Content-Type", entry.contentType)
		w.Header().Set("Cache-Control", "public, max-age=3600")
		w.Write(entry.data)
		return
	}
	imageCacheMu.RUnlock()

	resp, err := proxyClient.Get(rawURL)
	if err != nil {
		http.Error(w, "failed to fetch image", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		http.Error(w, "upstream error", resp.StatusCode)
		return
	}

	contentType := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		http.Error(w, "not an image", http.StatusBadRequest)
		return
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxImageSize+1))
	if err != nil {
		http.Error(w, "failed to read image", http.StatusBadGateway)
		return
	}
	if len(data) > maxImageSize {
		http.Error(w, "image too large", http.StatusBadRequest)
		return
	}

	// Store in cache
	imageCacheMu.Lock()
	if len(imageCache) >= maxCacheEntries {
		// Evict expired entries
		now := time.Now()
		for k, v := range imageCache {
			if now.After(v.expiresAt) {
				delete(imageCache, k)
			}
		}
		// If still full, evict oldest
		if len(imageCache) >= maxCacheEntries {
			for k := range imageCache {
				delete(imageCache, k)
				break
			}
		}
	}
	imageCache[rawURL] = &cacheEntry{
		data:        data,
		contentType: contentType,
		expiresAt:   time.Now().Add(cacheTTL),
	}
	imageCacheMu.Unlock()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Write(data)
}

func isPrivateHost(host string) bool {
	ip := net.ParseIP(host)
	if ip == nil {
		// Try resolving hostname
		addrs, err := net.LookupHost(host)
		if err != nil || len(addrs) == 0 {
			return false
		}
		ip = net.ParseIP(addrs[0])
		if ip == nil {
			return false
		}
	}

	return ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/mail/server && go test -run TestProxy -v`
Expected: PASS

- [ ] **Step 5: Register the route in register.go**

Add inside the `app.OnServe().BindFunc` block, after the existing routes:

```go
		// Image proxy (requires auth, proxies external images in emails)
		e.Router.GET("/api/mail/image-proxy", func(re *core.RequestEvent) error {
			handleImageProxy(re.Response, re.Request)
			return nil
		}).BindFunc(requireAuth)
```

- [ ] **Step 6: Run all Go tests**

Run: `cd packages/mail/server && go test -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/mail/server/endpoints_image_proxy.go packages/mail/server/endpoints_image_proxy_test.go packages/mail/server/register.go
git commit -m "feat: add authenticated image proxy endpoint with in-memory caching"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Run full project checks**

Run: `npm run checks`
Expected: PASS

- [ ] **Step 2: Run unit tests**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 3: Run Go tests**

Run: `cd packages/mail/server && go test -v`
Expected: PASS

- [ ] **Step 4: Manual smoke test on web**

Run: `npm run dev`

Test:
1. Open mail compose → verify Tiptap editor renders directly (no iframe), bold/italic/underline work
2. Send an email → verify HTML is correct
3. Open a received email → verify images load through proxy (check network tab for `/api/mail/image-proxy` requests)
4. Open docs editor → verify Tiptap renders, headings work
5. Reply inline → verify editor and toolbar work

- [ ] **Step 5: Commit any fixes from smoke testing**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
