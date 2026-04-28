# HeroUI Native → GlueStack UI v5 Migration

## Motivation

Two problems with HeroUI Native:
1. **Poor web compatibility** — components don't work well on web platform
2. **Limited component set** — missing AlertDialog, Actionsheet, Drawer, FAB, Accordion, Tabs, FormControl, Tooltip, Popover, and other common UI primitives, forcing us to build custom implementations

## Target Stack

- **GlueStack UI v5 alpha** (`gluestack-ui@5.0.3-alpha.0`) — Uniwind path
- **Uniwind** (keep current `^1.6.2`) — no change
- Remove: `heroui-native@^1.0.1`

GlueStack v5 alpha has first-class Uniwind support. The CLI (`npx gluestack-ui@alpha init`) offers a dedicated Uniwind path that generates components using Tailwind v4 with no NativeWind dependency. Components are copied into the project (shadcn-style), giving us full ownership.

### Risk Mitigation for Alpha

- Components are copied into our project — once added, they're ours regardless of upstream changes
- Playwright e2e coverage validates the migration
- We pin the CLI version and don't re-run it after initial setup
- If a specific generated component has issues, we fix it locally

## Component Mapping

### Direct Replacements

| HeroUI | Usage | GlueStack v5 | API Changes |
|---|---|---|---|
| `Dialog` | 10 files, 29 JSX usages | `Modal` (general) + `AlertDialog` (confirmations) | Subcomponents rename: `Dialog.Portal/Overlay/Content` → `ModalBackdrop/ModalContent`. AlertDialog has Header/Body/Footer structure |
| `Menu` | 6 files, compound pattern | `Menu` | Trigger pattern changes: `<Menu.Trigger>` child → `trigger` render prop. Items: `<Menu.Item>` → `<MenuItem>`, `<Menu.ItemTitle>` → `<MenuItemLabel>` |
| `Button` | 5 files | `Button` | Content via `<ButtonText>` child instead of string children. Has `action` (primary/secondary/positive/negative) and `variant` (solid/outline/link) props |
| `Separator` | 3 files, 16 usages | `Divider` | `orientation` prop ("horizontal"/"vertical"), className for styling |
| `BottomSheet` | 1 file (EventQuickCreate) | `Actionsheet` or `BottomSheet` | Actionsheet for action lists with items; BottomSheet for general content. Both have drag indicator and backdrop |
| `HeroUINativeProvider` | 1 file (Providers.tsx) | `GluestackUIProvider` | Theme config via `config.ts` with light/dark mode vars |
| `useThemeColor` | 110 files | Custom hook on `useCSSVariable` | Rebuild using Uniwind's `useCSSVariable` hook. Same API: `useThemeColor('foreground')` returns resolved color string |
| `MenuTriggerRef` type | 1 file (ContextMenu) | Controlled `isOpen` state | GlueStack Menu uses render-prop trigger with `{open}` state — use controlled mode for context menu |

### New Components Gained

| Component | Purpose | Replaces |
|---|---|---|
| `AlertDialog` | Confirmation dialogs | Custom `SuretyGuard` pattern using Dialog |
| `Actionsheet` | Mobile action sheets | Custom implementations |
| `Drawer` | Side panels (left/right/top/bottom) | N/A (new capability) |
| `Accordion` | Collapsible sections | N/A |
| `Tabs` | Tab navigation | N/A |
| `FormControl` | Form field wrapper with label/error/helper | Custom form layout |
| `Tooltip` | Hover tooltips | N/A |
| `Popover` | Positioned overlays | N/A |
| `FAB` | Floating action button | Custom `FAB` component |
| `Skeleton` | Loading states | N/A |
| `Toast` | Notifications | N/A |
| `Avatar` | User avatars | N/A |
| `Badge` | Status indicators | N/A |
| `Card` | Content containers | N/A |
| `Progress` | Progress indicators | N/A |
| `Spinner` | Loading spinners | N/A |

## Theme Migration

### Current System

HeroUI CSS variables in `global.css` with Tailwind v4 `@variant light/dark` syntax, resolved by `useThemeColor` from `heroui-native` (re-exported with extended types from `~/lib/use-app-theme`).

### Target System

GlueStack uses CSS variables with semantic token names. Our `global.css` keeps Tailwind v4 syntax. The `useThemeColor` hook is rebuilt on Uniwind's `useCSSVariable`.

### Token Name Mapping

| Current Token | GlueStack Token | Notes |
|---|---|---|
| `--background` | `--background` | Same |
| `--foreground` | `--foreground` | Same |
| `--accent` | `--primary` | GlueStack uses "primary" for main brand color |
| `--accent-foreground` | `--primary-foreground` | Follows primary convention |
| `--danger` | `--destructive` | GlueStack naming |
| `--danger-foreground` | `--destructive-foreground` | Follows destructive convention |
| `--muted` | `--muted-foreground` | GlueStack splits muted bg/fg |
| `--surface-secondary` | `--secondary` | |
| `--border` | `--border` | Same |
| `--overlay` | `--popover` | GlueStack uses popover for overlay surfaces |
| Custom tokens | Keep as-is | `--rail-background`, `--sidebar-background`, etc. unchanged |

### useThemeColor Replacement

The array overload of `useThemeColor` calls hooks in a loop, which violates React's rules of hooks. Two options:

**Option A: Drop the array overload.** Callers that use `const [fg, bg] = useThemeColor(['foreground', 'background'])` switch to two separate calls:
```ts
const fg = useThemeColor('foreground')
const bg = useThemeColor('background')
```

**Option B: Implement via `getComputedStyle` (web) / Uniwind store (native)** to read CSS variables without hooks:
```ts
import { useCSSVariable } from 'uniwind'

export function useThemeColor(color: AppThemeColor): string {
    return useCSSVariable(`--color-${color}`)
}
```

Option A is simpler and the tuple usage appears in ~15 files. We go with Option A: single-color hook only, update call sites to use multiple calls.

Note: This preserves the existing single-color API so most of the 110 files importing `useThemeColor` need only an import path change, not a usage change. The ~15 files using the array form need a minor refactor to multiple calls.

### global.css Updates

Replace HeroUI imports with GlueStack/Tailwind v4 directives:

```css
/* Before */
@import 'tailwindcss';
@import 'uniwind';
@import 'heroui-native/styles';
@source './node_modules/heroui-native/lib';

/* After */
@import 'tailwindcss';
@import 'uniwind';
```

Theme variables stay in the same `@layer theme` / `@variant light/dark` structure. Token names update per the mapping table above. Custom app tokens (`--rail-*`, `--sidebar-*`, etc.) remain unchanged.

## File Changes

### New Files (GlueStack components in `ui/`)

Generated by `npx gluestack-ui@alpha add`:

- `ui/gluestack-ui-provider/` — GluestackUIProvider + theme config
- `ui/menu/` — Menu, MenuItem, MenuItemLabel, MenuSeparator
- `ui/modal/` — Modal, ModalBackdrop, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter
- `ui/alert-dialog/` — AlertDialog and subcomponents
- `ui/button/` — Button, ButtonText, ButtonIcon, ButtonSpinner
- `ui/divider/` — Divider
- `ui/actionsheet/` — Actionsheet and subcomponents
- `ui/drawer/` — Drawer and subcomponents
- `ui/toast/` — Toast, ToastTitle, ToastDescription
- `ui/tooltip/` — Tooltip
- `ui/popover/` — Popover
- `ui/icon/` — Icon wrapper
- `ui/overlay/` — Portal/Overlay utilities
- Additional components added as needed (Avatar, Badge, Card, Skeleton, etc.)

### Modified Files

**Core infrastructure:**
- `components/Providers.tsx` — swap `HeroUINativeProvider` → `GluestackUIProvider`
- `global.css` — remove HeroUI imports, update token names
- `lib/use-app-theme.ts` — rewrite `useThemeColor` on Uniwind's `useCSSVariable`
- `package.json` — remove `heroui-native`, add `@gluestack-ui/*` core packages

**Component rewrites:**
- `components/DropdownMenu.tsx` — rewrite Menu pattern (compound children → render-prop trigger)
- `components/ContextMenu.tsx` — rewrite (no `MenuTriggerRef`, use controlled `isOpen` state)
- `components/SuretyGuard.tsx` — rewrite using `AlertDialog` instead of `Dialog`
- `components/LabelManagerDialog.tsx` — `Dialog` → `Modal`

**Import path updates (~110 files):**
- Files importing `useThemeColor` from `heroui-native` → `~/lib/use-app-theme` (many already do this)
- Files importing `{ Menu }` from `heroui-native` → `~/ui/menu`
- Files importing `{ Dialog }` from `heroui-native` → `~/ui/modal` or `~/ui/alert-dialog`
- Files importing `{ Button }` from `heroui-native` → `~/ui/button`
- Files importing `{ Separator }` from `heroui-native` → `~/ui/divider`
- Files importing `{ BottomSheet }` from `heroui-native` → `~/ui/actionsheet`

**Package-specific files (drive, calendar, mail, contacts, docs, sheets):**
- All files using HeroUI Dialog → Modal/AlertDialog
- All files using HeroUI Menu → GlueStack Menu
- All files using useThemeColor from heroui-native → ~/lib/use-app-theme

### Deleted

No local files deleted. `heroui-native` is removed as an npm dependency.

## API Pattern Changes

### Menu: Compound Children → Render Prop

```tsx
// Before (HeroUI)
<Menu>
    <Menu.Trigger>
        <Pressable>Open</Pressable>
    </Menu.Trigger>
    <Menu.Portal>
        <Menu.Overlay />
        <Menu.Content presentation="popover" className="min-w-[200px]">
            <Menu.Item onPress={handleAction}>
                <Menu.ItemTitle>Action</Menu.ItemTitle>
            </Menu.Item>
        </Menu.Content>
    </Menu.Portal>
</Menu>

// After (GlueStack)
<Menu
    trigger={({ ...triggerProps }) => (
        <Pressable {...triggerProps}>Open</Pressable>
    )}
    placement="bottom left"
    className="min-w-[200px]"
>
    <MenuItem onPress={handleAction}>
        <MenuItemLabel>Action</MenuItemLabel>
    </MenuItem>
</Menu>
```

### Dialog → Modal

```tsx
// Before (HeroUI)
<Dialog isOpen={open} onOpenChange={setOpen}>
    <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content className="w-[320px] p-4">
            {content}
        </Dialog.Content>
    </Dialog.Portal>
</Dialog>

// After (GlueStack)
<Modal isOpen={open} onClose={() => setOpen(false)}>
    <ModalBackdrop />
    <ModalContent className="w-[320px] p-4">
        {content}
    </ModalContent>
</Modal>
```

### Dialog (confirmation) → AlertDialog

```tsx
// Before (HeroUI)
<Dialog isOpen={open} onOpenChange={setOpen}>
    <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
            <Text>{message}</Text>
            <Button onPress={handleConfirm}>Confirm</Button>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog>

// After (GlueStack)
<AlertDialog isOpen={open} onClose={() => setOpen(false)}>
    <AlertDialogBackdrop />
    <AlertDialogContent>
        <AlertDialogBody>
            <Text>{message}</Text>
        </AlertDialogBody>
        <AlertDialogFooter>
            <Button onPress={handleConfirm}>
                <ButtonText>Confirm</ButtonText>
            </Button>
        </AlertDialogFooter>
    </AlertDialogContent>
</AlertDialog>
```

### Button: String Children → ButtonText

```tsx
// Before (HeroUI)
<Button onPress={handlePress} size="sm" className="bg-danger">
    Delete
</Button>

// After (GlueStack)
<Button onPress={handlePress} size="sm" action="negative">
    <ButtonText>Delete</ButtonText>
</Button>
```

### ContextMenu: Imperative Ref → Controlled State

```tsx
// Before (HeroUI)
const triggerRef = useRef<MenuTriggerRef>(null)
<Menu>
    <Menu.Trigger ref={triggerRef} asChild>
        <View onContextMenu={(e) => {
            e.preventDefault()
            triggerRef.current?.open()
        }}>{children}</View>
    </Menu.Trigger>
    ...
</Menu>

// After (GlueStack)
const [isOpen, setIsOpen] = useState(false)
<Menu
    isOpen={isOpen}
    onClose={() => setIsOpen(false)}
    trigger={({ ...triggerProps }) => (
        <View
            {...triggerProps}
            onContextMenu={(e) => {
                e.preventDefault()
                setIsOpen(true)
            }}
        >{children}</View>
    )}
>
    ...
</Menu>
```

## Migration Order

### Phase 1: Foundation
1. Run `npx gluestack-ui@alpha init` with Uniwind path
2. Generate GluestackUIProvider and core utilities into `ui/`
3. Add all needed components: `npx gluestack-ui@alpha add button modal alert-dialog menu divider actionsheet drawer toast tooltip popover icon overlay`

### Phase 2: Theme
4. Update `global.css` — remove HeroUI imports, update token names to GlueStack conventions
5. Rebuild `useThemeColor` hook using Uniwind's `useCSSVariable`
6. Update `GluestackUIProvider` config with our light/dark theme tokens

### Phase 3: Provider Swap
7. Replace `HeroUINativeProvider` → `GluestackUIProvider` in `components/Providers.tsx`
8. Verify app still renders (theme tokens working)

### Phase 4: Import Updates
9. Bulk update `useThemeColor` imports from `heroui-native` → `~/lib/use-app-theme` (files that import directly from heroui-native rather than our wrapper)

### Phase 5: Component Migration (dependency order)
10. **Divider** — simplest, 3 files. `Separator` → `Divider`
11. **Button** — 5 files. Add `ButtonText` children, update action/variant props
12. **Modal** — replaces Dialog in general-use cases (~8 files in drive, calendar, settings)
13. **AlertDialog** — replaces Dialog in confirmation cases (SuretyGuard, ConfirmTrash)
14. **Menu** — biggest API change, 6 files. Rewrite DropdownMenu, ContextMenu, UserMenu, DriveContextMenu
15. **Actionsheet** — replaces BottomSheet, 1 file (EventQuickCreate)

### Phase 6: Cleanup
16. Remove `heroui-native` from package.json
17. Run `npm run checks` (lint + typecheck)
18. Run `npm run test:unit`
19. Run `npm run test:e2e`

### Phase 7: Adopt New Components
20. Replace custom FAB with GlueStack FAB
21. Add Toast for notifications where applicable
22. Add Tooltip/Popover where beneficial
23. Consider FormControl integration with existing form components

## Validation

After each phase:
- `npm run checks` (Biome lint + format + typecheck)
- Visual smoke test on web and iOS

After full migration:
- `npm run test:unit`
- `npm run test:e2e` (Playwright — primary safety net)
- Manual verification of light/dark mode
- Manual verification of all Menu/Dialog/BottomSheet interactions on web
