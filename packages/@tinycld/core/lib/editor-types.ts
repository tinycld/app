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
