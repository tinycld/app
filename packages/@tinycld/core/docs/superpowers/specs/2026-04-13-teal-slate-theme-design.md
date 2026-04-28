# TinyCld Theme: Cool Teal + Tinted Slate

## Overview

Replace the default GlueStack theme with a distinctive Cool Teal + Tinted Slate palette that establishes TinyCld's visual identity. The theme uses teal (#0d9488) as the primary accent with slate neutrals that carry a subtle blue undertone, creating a modern, professional aesthetic that stands apart from Google Workspace (blue) and Microsoft 365 (blue).

Dark mode uses a blue-tinted dark base (#0f1629) rather than pure black, so light and dark modes feel like the same product.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary color | Teal-500 (#0d9488) | Distinctive vs. competitors, reads as trustworthy and modern |
| Neutral scale | Tailwind Slate (blue undertone) | Complements teal naturally; avoids warm/muddy dark grays |
| Dark mode base | Blue-tinted dark (#0f1629) | Continuity between modes; teal feels native to the cool environment |
| Status colors | Teal-harmonized (cool-shifted) | Emerald, amber, rose, cyan — sit naturally alongside teal |
| Rail behavior | Mode-adaptive | Dark slate in light mode, deeper in dark mode; proven pattern |
| Borders in dark | Semi-transparent slate | Adapt naturally to tinted background; no hard hex borders |

## Token Specification

### Primary

| Token | Light | Dark |
|-------|-------|------|
| `--primary` | `13 148 136` | `13 148 136` |
| `--primary-foreground` | `255 255 255` | `255 255 255` |
| `--ring` | `13 148 136` | `94 234 212` |

### Backgrounds

| Token | Light | Dark |
|-------|-------|------|
| `--background` | `255 255 255` | `15 22 41` |
| `--foreground` | `15 23 42` | `226 232 240` |
| `--surface` | `255 255 255` | `15 22 41` |
| `--surface-secondary` | `248 250 252` | `18 24 40` |

### Secondary & Muted

| Token | Light | Dark |
|-------|-------|------|
| `--secondary` | `248 250 252` | `30 41 59` |
| `--secondary-foreground` | `15 23 42` | `226 232 240` |
| `--muted` | `241 245 249` | `30 41 59` |
| `--muted-foreground` | `100 116 139` | `100 116 139` |
| `--accent` | `240 253 250` | `30 41 59` |
| `--accent-foreground` | `15 118 110` | `94 234 212` |

### Borders & Inputs

| Token | Light | Dark |
|-------|-------|------|
| `--border` | `226 232 240` | `30 41 59` |
| `--input` | `226 232 240` | `30 41 59` |

### Cards & Popovers

| Token | Light | Dark |
|-------|-------|------|
| `--card` | `255 255 255` | `18 24 40` |
| `--popover` | `255 255 255` | `18 24 40` |
| `--popover-foreground` | `15 23 42` | `226 232 240` |

### Destructive

| Token | Light | Dark |
|-------|-------|------|
| `--destructive` | `225 29 72` | `251 113 133` |

### Status Colors (New Tokens)

| Token | Light | Dark |
|-------|-------|------|
| `--success` | `16 185 129` | `110 231 183` |
| `--success-foreground` | `255 255 255` | `15 23 42` |
| `--warning` | `245 158 11` | `252 211 77` |
| `--warning-foreground` | `255 255 255` | `15 23 42` |
| `--danger` | `225 29 72` | `251 113 133` |
| `--danger-foreground` | `255 255 255` | `15 23 42` |
| `--info` | `6 182 212` | `103 232 249` |
| `--info-foreground` | `255 255 255` | `15 23 42` |

### Status Soft Variants (New Tokens)

Solid RGB values blended against respective mode backgrounds.

| Token | Light | Dark |
|-------|-------|------|
| `--success-soft` | `236 253 245` | `15 38 50` |
| `--warning-soft` | `255 251 235` | `38 36 38` |
| `--danger-soft` | `255 241 242` | `36 23 44` |
| `--info-soft` | `236 254 255` | `14 38 58` |

Note: Soft variants (`--danger-soft`, `--success-soft`, `--warning-soft`) are auto-computed by HeroUI's `color-mix()` from the base tokens and do not need manual CSS definitions.

### Custom App Tokens

| Token | Light | Dark |
|-------|-------|------|
| `--rail-background` | `#0f172a` | `#0b0f1a` |
| `--rail-text` | `#94a3b8` | `#64748b` |
| `--rail-active-text` | `#ffffff` | `#ffffff` |
| `--sidebar-background` | `#f8fafc` | `#121828` |
| `--active-indicator` | `#0d9488` | `#5eead4` |
| `--hover-background` | `rgba(15, 23, 42, 0.05)` | `rgba(148, 163, 184, 0.06)` |

### Fields & Overlay

| Token | Light | Dark |
|-------|-------|------|
| `--field-background` | `255 255 255` | `15 22 41` |
| `--field-placeholder` | `148 163 184` | `100 116 139` |
| `--overlay` | `255 255 255` | `18 24 40` |

## Implementation Scope

### Files that change

1. **`global.css`** — Update all token values in `@variant light` and `@variant dark`, add new status tokens (success, warning, error, info + soft variants), update `@theme inline` block with new color mappings.

2. **`lib/use-app-theme.ts`** — Add new semantic color names (`success`, `warning`, `error`, `info`, and their `-foreground` and `-soft` variants) to the `AppThemeColor` type union if it uses an explicit type.

### Files that don't change

- No component files — they already reference semantic tokens (`bg-primary`, `text-foreground`, `bg-destructive`, etc.)
- No GlueStack provider (`ui/gluestack-ui-provider/`) — token resolution is via CSS variables
- No Tailwind/Uniwind config — Tailwind v4 reads theme values from CSS
- No layout or routing changes

### New tokens (additive, no existing consumers)

- `--success`, `--success-foreground`, `--success-soft`
- `--warning`, `--warning-foreground`, `--warning-soft`
- `--danger`, `--danger-foreground`, `--danger-soft`
- `--info`, `--info-foreground`, `--info-soft`

These won't affect anything until components adopt them. Existing components using `--destructive` continue to work (we update its value but keep the token name).

### Risk

Very low. This is a CSS variable value swap. Individual tokens can be fine-tuned without touching any component code. The new status tokens are purely additive.

## Verification

After applying the theme:
1. Run `npm run checks` to verify no type errors from new token names
2. Visual check: light mode mail view, dark mode mail view, sidebar active states, compose button, search bar
3. Confirm rail darkens appropriately when switching to dark mode
4. Confirm teal accent is visible and readable in both modes
