# 06 — Styling & UI System

CodeBuddy uses Tailwind CSS 3 with a hand-built token layer in `src/app/globals.css`. The same
tokens are mirrored in `tailwind.config.ts` so utility classes like `bg-stage` or `text-text-dim`
resolve correctly.

---

## 6.1 Design tokens (CSS variables)

### Light mode (`:root`)

**Surfaces / containers**

| Token | Value | Role |
|---|---|---|
| `--void` | `#dddcd8` | Primary app background (warm light beige) |
| `--stage` | `#eae9e6` | Panel / card background |
| `--stage-up` | `#d4d3cf` | Elevated surface |
| `--stage-up2` | `#c7c6c2` | Further elevation |
| `--stage-up3` | `#b8b7b3` | Maximum elevation |
| `--edge` | `rgba(0,0,0,0.14)` | Borders |

**Text hierarchy**

| Token | Value | Role |
|---|---|---|
| `--text` | `#020202` | Primary text |
| `--text-soft` | `rgba(2,2,2,0.95)` | Softer primary |
| `--text-mid` | `rgba(2,2,2,0.84)` | Secondary |
| `--text-dim` | `rgba(2,2,2,0.70)` | Muted |
| `--text-ghost` | `rgba(2,2,2,0.52)` | Placeholder |

**Accent colors (shared with dark mode)**

| Token | Value | Role |
|---|---|---|
| `--sun` | `#ff9f1c` | Primary action / warning |
| `--coral` | `#ff6b6b` | Danger / priority |
| `--aqua` | `#4ecdc4` | Success / online |
| `--violet` | `#7c5cfc` | AI agent |
| `--mint` | `#34d399` | Positive state |
| `--sky` | `#60a5fa` | Info |
| `--gold` | `#d4af37` | Premium / highlight |

**Layout / motion**

| Token | Value | Role |
|---|---|---|
| `--panel-shadow` | `0 24px 80px rgba(0,0,0,0.06)` | Panel elevation |
| `--panel-radius` | `18px` | Default panel corner |
| `--shadow-card` | `0 1px 3px rgba(0,0,0,0.04), 0 12px 40px rgba(0,0,0,0.06)` | Card shadow |
| `--ease` | `cubic-bezier(0.4,0,0.2,1)` | Standard easing |
| `--spring` | `cubic-bezier(0.34,1.56,0.64,1)` | Springy motion |

**IDE rail palette** — `--rail-bg`, `--rail-card`, `--rail-elevated`, `--rail-code-bg`, `--rail-text`, `--rail-accent`, `--rail-hover`.

### Dark mode (`.dark` class on `<html>`)

Same structure, inverted:

| Token | Value |
|---|---|
| `--void` | `#08080a` |
| `--text` | `#f0ece4` |
| `--text-dim` | `rgba(240,236,228,0.52)` |
| `--rail-bg` | `#0c0c0f` |
| `--rail-card` | `rgba(255,255,255,0.028)` |

Accent colors are **not** re-themed in dark mode — they are used as-is to preserve brand identity.

---

## 6.2 Component classes

### Layout

- `.monolith-panel` — the standard content panel (border, rounded corners, `--panel-shadow`).
- `.left-rail` — fixed navigation rail, 52 px wide, expands to 200 px on hover/focus.
- `.rail-item` — individual nav button inside the rail.
- `.pulse-orb` — animated gradient circle used as loading/status accent.

### Surfaces

- `.card` — standard card with hover lift.
- `.surface` — alternate neutral surface.
- `.soft-panel`, `.soft-well`, `.soft-row` — nested surface hierarchy.
- `.glass`, `.glass-heavy` — backdrop-blur effects.

### Buttons & forms

- `.btn-primary` — solid dark button with hover opacity + lift.
- `.btn-secondary` — outlined with subtle background on hover.
- `.btn-ghost` — transparent / minimal.
- `.app-input` — input with a `--sun` focus ring.

### Status indicators

- `.status-dot` — 8×8 animated dot.
- `.status-dot-live` (aqua), `.status-dot-busy` (sun), `.status-dot-offline` (muted, no animation).

### Typography helpers

- `.font-display`, `.font-code` — Inter Tight / JetBrains Mono overrides.
- `.display-font`, `.text-body`, `.text-label` — semantic scale (provided by Tailwind plugins).
- `.theme-muted`, `.theme-fg`, `.theme-soft` — color tokens used by `MonolithPanel` children.
- `.pill` — small inline badge.

### Scrollbars

- Light mode: dark translucent thumb on transparent track.
- Dark mode: light translucent thumb.
- `.custom-scroll` — explicit 5 px scrollbar override.
- `.auto-hide-scrollbar` — hidden until hover / scroll.

---

## 6.3 Animations

- `@keyframes orb-breathe` — 4 s ease-in-out infinite radial gradient pulse.
- `@keyframes breathe` — 3 s ease-in-out infinite opacity + scale pulse.

These drive the `StatusDot` animation (live/busy) and `pulse-orb` visuals.

---

## 6.4 Typography

Loaded in `src/app/layout.tsx` via `next/font/google`:

| Family | CSS variable | Used by |
|---|---|---|
| Inter | `--font-body` | Body text, inputs, buttons |
| Inter Tight | `--font-display` | Headings, display text, stat values |
| JetBrains Mono | `--font-code` | Code blocks, terminal output, inline `` ` `` spans |

---

## 6.5 Layout primitives

- **LeftRail** (`src/components/left-rail.tsx`) — global navigation. Two groups of links: `alwaysItems` (Home, People, Settings) and `projectItems` (Workspace, Chat, Freestyle, Files, IDE, Downloads, Preview, Activity). Hover expands to 200 px. Active state renders an orange accent bar.
- **MonolithPanel** (`src/components/monolith-panel.tsx`) — route-aware content wrapper that chooses one of four layouts (full / wide / standard / onboarding) based on `usePathname()`.

---

## 6.6 Theming

- `ThemeProvider` (`src/components/theme-provider.tsx`) reads `localStorage["cb-theme"]` (falling back to `prefers-color-scheme: dark`), toggles the `dark` class on `<html>`, and persists the user's choice.
- Consumers use the `useTheme()` hook; `/settings` exposes the toggle.

---

## 6.7 Quick reference — where things live

| Concern | File |
|---|---|
| CSS variables, component classes, keyframes | `src/app/globals.css` |
| Tailwind config (mirrors tokens) | `tailwind.config.ts` |
| Theme provider / hook | `src/components/theme-provider.tsx` |
| Fonts | `src/app/layout.tsx` |
| Layout primitives | `src/components/left-rail.tsx`, `src/components/monolith-panel.tsx` |
| Status / activity visuals | `status-dot.tsx`, `progress-ring.tsx`, `activity-stream*.tsx` |
