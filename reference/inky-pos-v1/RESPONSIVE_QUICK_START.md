// Quick Reference: Responsive Design in InkyPOS

## The Problem We Fixed

1. **SafeAreaView deprecation** - All screens now use the correct package
2. **Missing Badge import** - Settings screen now imports Badge properly
3. **Non-responsive UI** - Added automatic scaling for all phone sizes

## Quick Examples

### Example 1: Get Screen Size Info

```tsx
import { useResponsive } from "../../utils/responsive";

export function MyComponent() {
  const { isSmallPhone, isTablet, width } = useResponsive();

  if (isSmallPhone) return <CompactLayout />;
  if (isTablet) return <TabletLayout />;
  return <PhoneLayout />;
}
```

### Example 2: Responsive Spacing

```tsx
import { useResponsive } from "../../utils/responsive";

export function MyComponent() {
  const { spacing, fontSize } = useResponsive();

  return (
    <View style={{ padding: spacing.md }}>
      <Text style={{ fontSize: fontSize.lg }}>Title</Text>
    </View>
  );
}
```

### Example 3: Two-Column Form (Auto-stacks on Small Phones)

```tsx
import { useResponsive } from "../../utils/responsive";

export function FormScreen() {
  const { isSmallPhone, columnWidth } = useResponsive();

  return (
    <View
      className={`flex-row ${isSmallPhone ? "flex-col" : "justify-between"}`}
    >
      <Input
        className={isSmallPhone ? "w-full mb-3" : `w-[${columnWidth}]`}
        label="Field 1"
      />
      <Input
        className={isSmallPhone ? "w-full" : `w-[${columnWidth}]`}
        label="Field 2"
      />
    </View>
  );
}
```

### Example 4: Use Ready-Made Components

```tsx
import { ResponsiveLayout } from "../../components/ResponsiveLayout";
import {
  ResponsiveSheet,
  ResponsiveGrid,
} from "../../components/ResponsiveSheet";

export function SettingsScreen() {
  return (
    <ResponsiveLayout scrollable>
      <ResponsiveSheet title="Basic Settings" variant="default">
        <Input label="Name" />
      </ResponsiveSheet>

      <ResponsiveGrid columns="auto">
        <Card>Card 1</Card>
        <Card>Card 2</Card>
        <Card>Card 3</Card>
      </ResponsiveGrid>
    </ResponsiveLayout>
  );
}
```

## Available Hook Values

```typescript
const {
  width,              // Screen width in pixels
  height,             // Screen height in pixels
  isSmallPhone,       // true if width < 375
  isStandardPhone,    // true if 375 <= width < 412
  isLargePhone,       // true if 412 <= width < 480
  isTablet,          // true if width >= 600
  isPortrait,        // true if height > width
  isLandscape,       // true if width > height
  spacing: {         // Responsive spacing values
    xs: number,      // 4 or 6px
    sm: number,      // 8 or 12px
    md: number,      // 12 or 16px
    lg: number,      // 16 or 20px
    xl: number,      // 20 or 24px
  },
  fontSize: {        // Responsive font sizes
    xs, sm, base, lg, xl, '2xl', '3xl'
  },
  contentPadding,    // Main content padding
  columnWidth,       // Auto-calculated column width
  iconSize: {        // Icon dimensions
    sm, md, lg, xl
  },
  buttonHeight,      // Optimal button height
  inputHeight,       // Optimal input height
} = useResponsive();
```

## Common Patterns

### Pattern 1: Conditional Rendering

```tsx
{
  isSmallPhone && <CompactMenu />;
}
{
  !isSmallPhone && <FullMenu />;
}
```

### Pattern 2: Dynamic Styling

```tsx
<Text style={{ fontSize: isSmallPhone ? 12 : 16 }}>Adaptive Text</Text>
```

### Pattern 3: Responsive Margins

```tsx
<View style={{ margin: spacing.md }}>Content</View>
```

### Pattern 4: Icon Sizing

```tsx
<Plus size={iconSize.md} />
```

### Pattern 5: Touch Targets (Buttons & Inputs)

```tsx
<View style={{ height: buttonHeight }} />
<View style={{ height: inputHeight }} />
```

## Files to Check

- **Core logic**: `src/utils/responsive.ts`
- **Ready components**: `src/components/ResponsiveLayout.tsx`
- **Grid/Sheet**: `src/components/ResponsiveSheet.tsx`
- **Detailed guide**: `RESPONSIVE_DESIGN.md`
- **All fixes**: `UI_FIXES_SUMMARY.md`

## Device Testing Checklist

- [ ] Small phone (< 375px) - iPhone SE
- [ ] Standard phone (375-411px) - iPhone 13/14
- [ ] Large phone (412-479px) - iPhone Pro Max
- [ ] Tablet (>= 600px) - iPad

All these should render correctly without text overflow, touch targets should be comfortable (>44px), and layouts should not be cramped.
