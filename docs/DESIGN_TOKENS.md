# InkyPOS Design Tokens

One consistent design system across the web back office and the till app ensures a professional, recognizable brand and faster development.

## Color Palette

All colors use OKLCH format on the web (for perceptual uniformity) and hex on the till (for React Native). They are identical.

### Light Mode (Default)

| Token | Web (OKLCH) | Till (Hex) | Usage |
|---|---|---|---|
| **Background** | `oklch(0.984 0.003 247.858)` | `#F8FAFC` | Page backgrounds, base layer |
| **Surface** | `oklch(1 0 0)` | `#FFFFFF` | Cards, dialogs, input fields |
| **Text** | `oklch(0.208 0.042 265.755)` | `#0F172A` | Primary text, headings |
| **Text Muted** | `oklch(0.554 0.046 257.417)` | `#64748B` | Secondary text, captions, disabled state |
| **Border** | `oklch(0.929 0.013 255.508)` | `#E2E8F0` | Dividers, card edges, input borders |
| **Primary** | `oklch(0.511 0.262 276.966)` | `#4F46E5` | Buttons, links, focus rings (InkyPOS indigo-600) |
| **Accent** | `oklch(0.962 0.018 272.314)` | `#EEF2FF` | Highlights, selected states, chip backgrounds |
| **Success** | `oklch(0.596 0.145 163.225)` | `#059669` | Confirmation, approved, active states |
| **Warning** | `oklch(0.666 0.179 58.318)` | `#B45309` | Alerts, caution, pending states |
| **Danger** | `oklch(0.577 0.245 27.325)` | `#DC2626` | Destructive actions, errors, critical alerts |
| **Info** | Same as Primary | `#4F46E5` | Informational messages, neutral alerts |

### Dark Mode

| Token | Web (OKLCH) | Till (Hex) | Usage |
|---|---|---|---|
| **Background** | `oklch(0.113 0.004 247.858)` | `#1C1C24` | Page backgrounds (slate-950) |
| **Surface** | `oklch(0.155 0.005 247.858)` | `#27272E` | Cards, dialogs (slate-900) |
| **Text** | `oklch(0.985 0 0)` | `#FAFAFA` | Primary text (white) |
| **Text Muted** | `oklch(0.71 0.035 256.788)` | `#B4B4B8` | Secondary text (slate-400) |
| **Border** | `oklch(0.205 0.04 256.788)` | `#35353D` | Dividers, edges (slate-800) |
| **Primary** | `oklch(0.667 0.253 277)` | `#A5B4FC` | Buttons, links (indigo-400) |
| **Accent** | `oklch(0.206 0.032 260.031)` | `#342E65` | Highlights (indigo-900) |
| **Success** | `oklch(0.66 0.15 163.225)` | `#34D399` | Confirmation (green-500) |
| **Warning** | `oklch(0.71 0.18 58.318)` | `#FBBF24` | Alerts (yellow-500) |
| **Danger** | `oklch(0.63 0.235 27.325)` | `#F87171` | Destructive (red-500) |
| **Info** | Same as Primary | `#A5B4FC` | Informational (indigo-400) |

### Foreground Colors (Text-on-Color)

- **onPrimary**: `#FFFFFF` (light), `#0F0F1E` (dark) — text on primary buttons
- **onSuccess**: `#FFFFFF` — text on success backgrounds
- **onWarning**: `#FFFFFF` — text on warning backgrounds
- **onDanger**: `#FFFFFF` — text on danger backgrounds
- **onInfo**: `#FFFFFF` — text on info backgrounds
- **onAccent**: `#1E1B4B` (light), `#A5B4FC` (dark) — text on accent highlights

## Spacing Scale

Used for margins, padding, and gaps. Consistent spacing creates rhythm and clarity.

```
xs:    4px  (0.25rem)
sm:    8px  (0.5rem)
md:   12px  (0.75rem)
lg:   16px  (1rem)
xl:   24px  (1.5rem)
xxl:  32px  (2rem)
xxxl: 48px  (3rem)
huge: 64px  (4rem)
```

**Usage:**
- `xs`: Tight padding inside small components (chips, badges)
- `sm`: Input padding, small gaps between elements
- `md`: Card padding, gaps in grids
- `lg`: Section padding, major spacing
- `xl`: Sidebar padding, large gaps
- `xxl`: Page padding, section margins
- `xxxl`, `huge`: Rare; used for hero sections or major visual breaks

## Border Radius

```
sm:   6px   (0.375rem)   — buttons, small inputs
md:   8px   (0.5rem)     — cards, modals, larger inputs
lg:  10px   (0.625rem)   — main radius (shadcn default)
xl:  12px   (0.75rem)    — prominent cards, dialogs
full: 9999px             — pills, fully rounded
```

## Typography Scale

Used for headings, body, and captions. Ensures consistent hierarchy.

```
xs:    12px (0.75rem)   — captions, tiny labels
sm:    14px (0.875rem)  — small labels, muted text
md/base: 16px (1rem)    — body text, input labels
lg:    18px (1.125rem)  — subheadings
xl:    20px (1.25rem)   — section headings
xxl:   24px (1.5rem)    — page titles
xxxl:  30px (1.875rem)  — prominent headings
huge:  36px (2.25rem)   — hero text, main titles
```

**Line heights:**
- `tight` (1.25): headings, compact lists
- `normal` (1.5): body text, labels
- `relaxed` (1.75): long-form content, accessibility

## Shadows

Provide depth and hierarchy.

```
sm:  0 1px 2px 0 rgba(0,0,0,0.05)
md:  0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)
lg:  0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)
xl:  0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)
```

**Usage:**
- `sm`: Subtle elevation (disabled states)
- `md`: Cards, dropdowns
- `lg`: Modals, floating menus
- `xl`: Full-page overlays

## Implementing Dark Mode

### Web (apps/web)

Dark mode is automatic based on OS preference (`@media (prefers-color-scheme: dark)`) or forced via the `data-theme` attribute on `<html>`:

```html
<!-- Force light mode: -->
<html data-theme="light">

<!-- Force dark mode: -->
<html data-theme="dark">

<!-- Auto (respects OS): -->
<html>
```

To add a dark mode toggle, set `document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')`.

### Till (apps/pos)

The till automatically uses the device's color scheme via React Native's `useColorScheme()` hook. Call `useColors()` in any component to get the current palette:

```tsx
import { useColors, spacing, radius, fontSize } from './ui/theme';

export function MyComponent() {
  const colors = useColors();
  return (
    <View style={{ backgroundColor: colors.background, padding: spacing.md }}>
      <Text style={{ color: colors.text, fontSize: fontSize.md }}>Hello</Text>
    </View>
  );
}
```

## Status Color Usage

Use consistent semantics across all screens:

- **Success** (`#059669` / `#34D399`): Confirmed actions, active items, positive states
- **Warning** (`#B45309` / `#FBBF24`): Caution, pending states, low stock warnings
- **Danger** (`#DC2626` / `#F87171`): Errors, destructive actions, offline status
- **Info** (indigo, same as primary): Neutral information, notices

**In context:**
- "Sale confirmed" → Success
- "Low stock" → Warning
- "Offline mode" → Danger (until synced)
- "Shift open" → Info

## Component Color Tokens

### Buttons

| Style | Light | Dark |
|---|---|---|
| **Primary** | Indigo-600 bg, white text | Indigo-400 bg, dark text |
| **Secondary** | Slate-100 bg, slate-900 text | Slate-800 bg, white text |
| **Danger** | Red-600 bg, white text | Red-500 bg, white text |
| **Disabled** | Muted bg, muted text | Muted bg, muted text |

### Inputs

- **Background**: Surface color (white / slate-900)
- **Border**: Border color (slate-200 / slate-800)
- **Focus ring**: Primary color with 50% opacity

### Cards

- **Background**: Surface color
- **Border**: Border color (optional)
- **Shadow**: `md` by default

### Badges & Status

| Status | Background | Text |
|---|---|---|
| **Active** | Success | onSuccess (white) |
| **Inactive/Disabled** | Muted | Muted foreground |
| **Pending** | Warning | onWarning (white) |
| **Error** | Danger | onDanger (white) |

## Testing Colors

To verify colors work across light/dark on the web:

1. **At desktop width (1024px+):**
   ```
   npm run dev
   # Check in browser, then toggle dark mode in DevTools (F12 > Settings > Rendering)
   ```

2. **At mobile width (375px):**
   ```
   # Same browser, resize to ~375px
   ```

## Accessibility

All color combinations meet **WCAG 2.2 AA** contrast requirements:
- Text on background: ≥4.5:1
- UI components on background: ≥3:1
- Status colors: distinguish by shape + color, never color alone

Never rely on color alone to convey meaning. Pair with icons, badges, or text.

## Future Extensions

When adding new colors:
1. Add to both light and dark palettes in `index.css` and `theme.ts`
2. Ensure WCAG AA contrast (test with WebAIM contrast checker)
3. Use OKLCH for web, matching hex values for the till
4. Add to this document
5. Test in light and dark mode at all viewport widths
