# Nexus Clean Pro Design System Documentation

## 1. Visual Direction & Principles

The **Nexus Clean Pro** design system delivers a state-of-the-art, high-density, minimalist user interface inspired by tools like Linear and Notion. It provides equal priority for desktop and mobile viewports, full light and dark mode capability, and zero raw color compromises.

### Core Tenets
1. **Semantic Token Purity**: No raw Tailwind palette colors (e.g. `bg-zinc-800`, `text-blue-500`) and no arbitrary hex values in components. All colors are strictly derived from semantic CSS tokens defined in `globals.css` and mapped in `tailwind.config.ts`.
2. **WCAG 2.2 AA Contrast Compliance**: 100% of text and functional boundaries maintain >= 4.5:1 contrast for normal text and >= 3:1 for large text/borders across both light and dark themes and across all 5 accent palettes.
3. **Typography Standard**: Readable text never drops below 12px (`text-xs`). No micro-text (`text-[9px]`, `text-[10px]`, `text-[11px]`).
4. **Adaptive Density**: Supports both **Comfortable** (36px action rows) and **Compact** (28px action rows) modes with dynamic text scaling (90%, 100%, 112%, 125%).
5. **Smooth Responsive Ergonomics**: Centered modals on desktop seamlessly become bottom sheets with drag handles on mobile (`sm:rounded-dialog` -> `max-sm:bottom-0 max-sm:rounded-t-2xl`).

---

## 2. Color System & Theme Tokens

All colors are defined as HSL values in `src/app/globals.css`.

### Base Surface Hierarchy

| Token | Light Mode (`:root`) | Dark Mode (`.dark`) | Usage |
| :--- | :--- | :--- | :--- |
| `--background` | `hsl(0 0% 98%)` | `hsl(240 6% 8%)` | Root application canvas |
| `--card` | `hsl(0 0% 100%)` | `hsl(240 5% 10%)` | Content cards, modals, popovers |
| `--surface-panel` | `hsl(0 0% 98%)` | `hsl(240 5% 9%)` | Dialog inner cards, side drawers |
| `--surface-sidebar`| `hsl(240 5% 96%)` | `hsl(240 6% 9%)` | Left/right channel sidebars |
| `--surface-header` | `hsl(0 0% 98%)` | `hsl(240 5% 10%)` | 52px top navigation headers |
| `--surface-default`| `hsl(240 4% 94%)` | `hsl(240 5% 12%)` | Channel items, inputs, subtle wells |
| `--surface-hover`  | `hsl(240 4% 90%)` | `hsl(240 5% 15%)` | Hover states on interactive items |
| `--border`         | `hsl(240 6% 88%)` | `hsl(240 4% 18%)` | Standard borders (>= 3:1 boundary) |
| `--border-strong`  | `hsl(240 6% 75%)` | `hsl(240 4% 28%)` | High-contrast divider borders |

### Accent Color Themes

The system supports 5 user-selectable accents dynamically switched via `data-theme`:

| Accent Name | `data-theme` Key | Primary HSL (Dark / Light) | Character |
| :--- | :--- | :--- | :--- |
| **Violet** (Default) | `violet` | `hsl(262 83% 58%)` / `hsl(262 83% 45%)` | Sleek modern pro |
| **Cyan** | `cyan` | `hsl(189 94% 43%)` / `hsl(189 94% 32%)` | Tactical, crisp |
| **Emerald** | `emerald` | `hsl(158 64% 42%)` / `hsl(158 64% 32%)` | Balanced, calm |
| **Crimson** | `crimson` | `hsl(346 77% 49%)` / `hsl(346 77% 38%)` | High-energy, intense |
| **Amber** | `amber` | `hsl(38 92% 50%)` / `hsl(38 92% 38%)` | Warm, studio |

---

## 3. Typography & Spacing Scale

### Type Hierarchy
- `text-xs` (12px): Metadata, timestamps, badges, secondary labels, shortcuts. (Hard lower bound).
- `text-sm` (14px): Body text, message contents, channel names, standard controls.
- `text-base` (16px): Section subheadings, dialog titles on mobile.
- `text-lg` (18px): Dialog titles, panel headers.
- `text-xl` (20px) / `text-2xl` (24px): Auth headings, hero headers.

### Shell Dimensions
- **Server Rail**: `56px` (`w-14`), 36px rounded-[10px] icon slots with active vertical accent pills.
- **Collapsible Sidebar**: Resizable from `220px` to `320px` (default `240px`).
- **Channel Header**: Fixed `52px` (`h-[52px]`).
- **Mobile Bottom Navigation**: `56px` (`h-14`) + `env(safe-area-inset-bottom)`.
- **Mobile Voice Mini-Bar**: `52px` floating above the bottom navigation bar.
- **Touch Targets**: All mobile action buttons, tabs, and toggles enforce minimum `44px x 44px` hit areas.

---

## 4. UI Primitives Suite (`src/components/ui/`)

All primitives are accessible, keyboard navigable, and built upon Radix UI primitives:

1. **`Button` (`button.tsx`)**:
   - Variants: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`.
   - Sizes: `sm` (28px), `default` (36px), `lg` (44px), `iconSm` (28x28px), `icon` (36x36px).
   - Built-in `isLoading` spinner state and disabled contrast retention.
2. **`Dialog` (`dialog.tsx`)**:
   - Centered 12px rounded elevation on desktop (`sm:rounded-dialog`).
   - Bottom sheet slide-up with drag handle on mobile viewports (`max-sm:bottom-0 max-sm:rounded-t-2xl`).
3. **`Sheet` (`sheet.tsx`)**:
   - Slide-over drawers for mobile navigation and channel drawers with smooth easing.
4. **`Switch` (`switch.tsx`)**:
   - Accessible toggle control with 44px hit-box padding and primary accent fill.
5. **`Badge` & `Pill` & `Kbd` (`badge.tsx`, `kbd.tsx`)**:
   - Semantic indicator badges (`default`, `secondary`, `destructive`, `success`, `warning`, `outline`).
   - Monospace `Kbd` component for keyboard shortcut hints.
6. **`Avatar` (`avatar.tsx`)**:
   - High-density avatar with initials fallback and active presence status rings.
7. **`CommandDialog` (`command-palette.tsx`)**:
   - Full keyboard-driven CmdK command palette and switcher.
8. **`Toast` (`toast.tsx`)**:
   - Non-blocking notification toasts with undo actions and auto-dismissal.

---

## 5. Verification & Quality Gates

The design system enforces continuous quality via two automated scripts:
- `node scripts/check-contrast.mjs`: Tests normal and large text contrast ratios against WCAG 2.2 AA standards across light/dark modes and all 5 accent colors.
- `node scripts/quality-ratchet.mjs`: Enforces strict zero-violation ceilings on raw colors, non-allowlisted hex values, white/[0.0x] opacity borders, and small text (<12px).
