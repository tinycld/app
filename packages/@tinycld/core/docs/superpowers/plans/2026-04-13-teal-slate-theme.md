# Teal + Slate Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default GlueStack/HeroUI theme with a Cool Teal + Tinted Slate palette, covering light mode, dark mode, status colors, and workspace-specific tokens.

**Architecture:** Pure CSS token swap in `global.css`. HeroUI provides base token variables (`--success`, `--danger`, etc.) which feed into computed `color-mix()` derivatives (soft variants, hover states). We override the base tokens; HeroUI handles the rest. Custom app tokens (rail, sidebar, interactions) use hex/rgba values. One type update in `lib/use-app-theme.ts` to add `info` colors.

**Tech Stack:** CSS custom properties (Tailwind v4 `@variant` syntax), HeroUI Native theme system, Uniwind

**Spec:** `docs/superpowers/specs/2026-04-13-teal-slate-theme-design.md`

---

### Important: Token Naming

The spec uses `--error` but HeroUI uses `--danger`. All implementations must use `--danger` to match HeroUI's naming convention. The soft variants (`--danger-soft`, `--success-soft`, etc.) are auto-computed by HeroUI via `color-mix()` from the base tokens — we do NOT manually define them.

### Important: HeroUI oklch Convention

HeroUI defines its default tokens using oklch color values (e.g. `oklch(0.6532 0.2328 25.74)`). Our existing `global.css` overrides use RGB triplets (e.g. `220 38 38`) which also work because HeroUI's `theme.css` references them as `var(--danger)`. Either format works, but RGB triplets enable the Tailwind opacity modifier syntax (`bg-primary/50`). We'll use RGB triplets for consistency with existing overrides.

---

### Task 1: Update GlueStack Semantic Tokens (Light Mode)

**Files:**
- Modify: `global.css:6-50` (light mode `@variant light` block)

- [ ] **Step 1: Update the primary, background, and surface tokens in light mode**

Replace the existing `@variant light` block's GlueStack semantic tokens section (lines 7-34) with:

```css
/* GlueStack semantic tokens (RGB triplets for opacity modifier support) */
--primary: 13 148 136;
--primary-foreground: 255 255 255;
--card: 255 255 255;
--secondary: 248 250 252;
--secondary-foreground: 15 23 42;
--background: 255 255 255;
--popover: 255 255 255;
--popover-foreground: 15 23 42;
--muted: 241 245 249;
--muted-foreground: 100 116 139;
--destructive: 225 29 72;
--foreground: 15 23 42;
--border: 226 232 240;
--input: 226 232 240;
--ring: 13 148 136;
--accent: 240 253 250;
--accent-foreground: 15 118 110;

/* Surface */
--surface: 255 255 255;
--surface-secondary: 248 250 252;

/* Fields */
--field-background: 255 255 255;
--field-placeholder: 148 163 184;

/* Overlay */
--overlay: 255 255 255;

/* Status colors (teal-harmonized) */
--success: 16 185 129;
--success-foreground: 255 255 255;
--warning: 245 158 11;
--warning-foreground: 255 255 255;
--danger: 225 29 72;
--danger-foreground: 255 255 255;
--info: 6 182 212;
--info-foreground: 255 255 255;
```

- [ ] **Step 2: Update custom app tokens in light mode**

Replace the custom app tokens section (lines 37-49) with:

```css
/* Custom app tokens */
--rail-background: #0f172a;
--color-rail-background: #0f172a;
--rail-text: #94a3b8;
--color-rail-text: #94a3b8;
--rail-active-text: #ffffff;
--color-rail-active-text: #ffffff;
--sidebar-background: #f8fafc;
--color-sidebar-background: #f8fafc;
--active-indicator: #0d9488;
--color-active-indicator: #0d9488;
--hover-background: rgba(15, 23, 42, 0.05);
--color-hover-background: rgba(15, 23, 42, 0.05);
```

- [ ] **Step 3: Verify the file parses correctly**

Run: `npm run checks`
Expected: PASS (no CSS parse errors, no type errors)

- [ ] **Step 4: Commit**

```bash
git add global.css
git commit -m "theme: update light mode tokens to teal + slate palette"
```

---

### Task 2: Update GlueStack Semantic Tokens (Dark Mode)

**Files:**
- Modify: `global.css:52-96` (dark mode `@variant dark` block)

- [ ] **Step 1: Update the dark mode semantic tokens**

Replace the existing `@variant dark` block's GlueStack semantic tokens section (lines 53-80) with:

```css
/* GlueStack semantic tokens */
--primary: 13 148 136;
--primary-foreground: 255 255 255;
--card: 18 24 40;
--secondary: 30 41 59;
--secondary-foreground: 226 232 240;
--background: 15 22 41;
--popover: 18 24 40;
--popover-foreground: 226 232 240;
--muted: 30 41 59;
--muted-foreground: 100 116 139;
--destructive: 251 113 133;
--foreground: 226 232 240;
--border: 30 41 59;
--input: 30 41 59;
--ring: 94 234 212;
--accent: 30 41 59;
--accent-foreground: 94 234 212;

/* Surface */
--surface: 15 22 41;
--surface-secondary: 18 24 40;

/* Fields */
--field-background: 15 22 41;
--field-placeholder: 100 116 139;

/* Overlay */
--overlay: 18 24 40;

/* Status colors (teal-harmonized) */
--success: 110 231 183;
--success-foreground: 15 23 42;
--warning: 252 211 77;
--warning-foreground: 15 23 42;
--danger: 251 113 133;
--danger-foreground: 15 23 42;
--info: 103 232 249;
--info-foreground: 15 23 42;
```

- [ ] **Step 2: Update custom app tokens in dark mode**

Replace the custom app tokens section (lines 83-95) with:

```css
/* Custom app tokens */
--rail-background: #0b0f1a;
--color-rail-background: #0b0f1a;
--rail-text: #64748b;
--color-rail-text: #64748b;
--rail-active-text: #ffffff;
--color-rail-active-text: #ffffff;
--sidebar-background: #121828;
--color-sidebar-background: #121828;
--active-indicator: #5eead4;
--color-active-indicator: #5eead4;
--hover-background: rgba(148, 163, 184, 0.06);
--color-hover-background: rgba(148, 163, 184, 0.06);
```

- [ ] **Step 3: Verify the file parses correctly**

Run: `npm run checks`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add global.css
git commit -m "theme: update dark mode tokens to tinted slate palette"
```

---

### Task 3: Update @theme inline Block and Add New Token Mappings

**Files:**
- Modify: `global.css:100-127` (`@theme inline` block)

- [ ] **Step 1: Update the @theme inline block to include new status and info tokens**

Replace the entire `@theme inline` block (lines 101-127) with:

```css
@theme inline {
    --color-primary: rgb(var(--primary));
    --color-primary-foreground: rgb(var(--primary-foreground));
    --color-card: rgb(var(--card));
    --color-secondary: rgb(var(--secondary));
    --color-secondary-foreground: rgb(var(--secondary-foreground));
    --color-background: rgb(var(--background));
    --color-popover: rgb(var(--popover));
    --color-popover-foreground: rgb(var(--popover-foreground));
    --color-muted: rgb(var(--muted));
    --color-muted-foreground: rgb(var(--muted-foreground));
    --color-destructive: rgb(var(--destructive));
    --color-foreground: rgb(var(--foreground));
    --color-border: rgb(var(--border));
    --color-input: rgb(var(--input));
    --color-ring: rgb(var(--ring));
    --color-accent: rgb(var(--accent));
    --color-accent-foreground: rgb(var(--accent-foreground));
    --color-surface: rgb(var(--surface));
    --color-surface-secondary: rgb(var(--surface-secondary));
    --color-info: rgb(var(--info));
    --color-info-foreground: rgb(var(--info-foreground));
    --color-rail-background: var(--rail-background);
    --color-rail-text: var(--rail-text);
    --color-rail-active-text: var(--rail-active-text);
    --color-sidebar-background: var(--sidebar-background);
    --color-active-indicator: var(--active-indicator);
    --color-hover-background: var(--hover-background);
}
```

Note: `--color-success`, `--color-danger`, `--color-warning` and their derivatives are already mapped in HeroUI's `theme.css`. We only need to add `--color-info` and `--color-info-foreground` since HeroUI doesn't define an info token. The existing success/danger/warning tokens flow through HeroUI's `@theme inline static` block automatically.

- [ ] **Step 2: Run checks**

Run: `npm run checks`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add global.css
git commit -m "theme: add info token mappings to @theme inline block"
```

---

### Task 4: Update AppThemeColor Type

**Files:**
- Modify: `lib/use-app-theme.ts:3-9` (CustomThemeColor type)

- [ ] **Step 1: Add info colors to the CustomThemeColor type**

The `BuiltInThemeColor` type already includes `success`, `success-foreground`, `warning`, `warning-foreground`, `danger`, `danger-foreground`, and their soft variants. But it does NOT include `info` or `info-foreground` since these aren't standard HeroUI tokens.

Add `info` and `info-foreground` to the `CustomThemeColor` union in `lib/use-app-theme.ts`:

```typescript
type CustomThemeColor =
    | 'rail-background'
    | 'rail-text'
    | 'rail-active-text'
    | 'sidebar-background'
    | 'active-indicator'
    | 'hover-background'
    | 'info'
    | 'info-foreground'
```

- [ ] **Step 2: Run checks**

Run: `npm run checks`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/use-app-theme.ts
git commit -m "theme: add info color type to AppThemeColor"
```

---

### Task 5: Update Design Spec to Match Implementation

**Files:**
- Modify: `docs/superpowers/specs/2026-04-13-teal-slate-theme-design.md`

- [ ] **Step 1: Update spec to use `--danger` instead of `--error`**

In the spec's "Status Colors (New Tokens)" table, rename `--error` and `--error-foreground` to `--danger` and `--danger-foreground`. Also rename `--error-soft` to `--danger-soft` in the "Status Soft Variants" table.

Add a note that soft variants are auto-computed by HeroUI's `color-mix()` from the base tokens and don't need manual CSS definitions.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-04-13-teal-slate-theme-design.md
git commit -m "docs: align spec naming with HeroUI convention (danger, not error)"
```

---

### Task 6: Visual Verification

No files to modify — this is a manual check.

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`

- [ ] **Step 2: Visual check in light mode**

Open the app in a browser. Verify:
- Primary buttons (Compose) are teal (#0d9488) with white text
- Background is white, text is dark slate
- Sidebar background is slate-50 (#f8fafc)
- Rail is dark slate (#0f172a)
- Active sidebar item uses teal active indicator
- Search bar has slate-50 background with slate-200 border
- Label dots are vibrant and distinct

- [ ] **Step 3: Visual check in dark mode**

Switch to dark mode (via settings or system preference). Verify:
- Background is blue-tinted dark (#0f1629), NOT pure black
- Cards/popovers are slightly lifted (#121828)
- Primary buttons stay teal (#0d9488)
- Focus rings shift to teal-300 (#5eead4)
- Rail deepens to #0b0f1a
- Sidebar matches surface-secondary (#121828)
- Borders are visible but subtle (slate-800)
- Text is slate-200, not pure white — comfortable for extended reading

- [ ] **Step 4: Check interaction states**

In both modes:
- Hover states on sidebar items show subtle background
- Active indicator is teal (light) / teal-300 (dark)
- Focus rings on inputs are teal
- Destructive/danger elements are rose-colored

- [ ] **Step 5: Report any needed adjustments**

If any token values need tweaking (contrast too low, colors feel off), adjust the specific token in `global.css` and re-check. Each token is isolated — changes don't cascade.
