// RESPONSIVE DESIGN GUIDE

## Overview

This guide explains how to use the responsive design utilities to ensure InkyPOS adapts properly to different phone screen sizes.

## Files Created

1. `src/utils/responsive.ts` - Core responsive utilities hook
2. `src/components/ResponsiveLayout.tsx` - Layout components with SafeAreaView
3. `src/components/ResponsiveSheet.tsx` - Responsive sheet and grid components

## Usage Examples

### Using useResponsive Hook

```tsx
import { useResponsive } from "../../utils/responsive";

export function MyScreen() {
  const { isSmallPhone, isTablet, spacing, fontSize, columnWidth } =
    useResponsive();

  return (
    <View>
      {/* Conditional rendering based on screen size */}
      {isSmallPhone && <Text>Small Phone Layout</Text>}
      {isTablet && <Text>Tablet Layout</Text>}

      {/* Using responsive values */}
      <Text style={{ fontSize: fontSize.base }}>Responsive Text</Text>
      <View style={{ padding: spacing.md }}>Content</View>
    </View>
  );
}
```

### Using ResponsiveLayout

```tsx
import { ResponsiveLayout } from "../../components/ResponsiveLayout";

export function MyScreen() {
  return (
    <ResponsiveLayout scrollable>
      <Text>Your content here - automatically padded</Text>
    </ResponsiveLayout>
  );
}
```

### Using ResponsiveSheet

```tsx
import {
  ResponsiveSheet,
  ResponsiveGrid,
} from "../../components/ResponsiveSheet";

export function MyScreen() {
  return (
    <View>
      {/* Responsive card/sheet */}
      <ResponsiveSheet title="Settings">
        <Input label="Name" />
      </ResponsiveSheet>

      {/* Responsive grid - auto-switches between 1-3 columns */}
      <ResponsiveGrid columns="auto">
        <Card>Item 1</Card>
        <Card>Item 2</Card>
        <Card>Item 3</Card>
      </ResponsiveGrid>
    </View>
  );
}
```

## Responsive Breakpoints

- **Small Phones**: width < 375px (iPhone SE, etc.)
- **Standard Phones**: 375px - 411px (iPhone 13, 14, etc.)
- **Large Phones**: 412px - 479px (iPhone Pro Max, etc.)
- **Tablets**: width >= 600px

## Fixed Issues

### 1. SafeAreaView Deprecation

**Problem**: React Native's SafeAreaView was deprecated
**Solution**: All screens now import from 'react-native-safe-area-context'
**Files Updated**:

- src/app/(app)/settings.tsx
- src/app/(app)/index.tsx
- src/app/(app)/pos.tsx
- src/app/(app)/inventory.tsx
- src/app/(app)/menu.tsx
- src/app/(app)/finder.tsx
- src/app/(app)/accounting.tsx
- src/app/(app)/reports.tsx
- src/app/(auth)/login.tsx
- src/app/(auth)/pin.tsx

### 2. Missing Badge Import

**Problem**: Settings screen referenced Badge without importing it
**Solution**: Added `import { Badge } from '../../components/ui/Badge';`
**File**: src/app/(app)/settings.tsx

### 3. Responsive UI

**Problem**: UI didn't adjust properly for different phone sizes
**Solution**: Created responsive utilities that adapt:

- Spacing based on device size
- Font sizes for readability
- Column layouts that collapse on small screens
- Icon and button sizes
- Content padding

## Implementation Best Practices

1. **For New Screens**: Use ResponsiveLayout wrapper

   ```tsx
   export default function NewScreen() {
     return (
       <ResponsiveLayout scrollable backgroundColor="bg-slate-50">
         {/* Content */}
       </ResponsiveLayout>
     );
   }
   ```

2. **For Two-Column Forms**: Use columnWidth from useResponsive

   ```tsx
   const { columnWidth, isSmallPhone } = useResponsive();

   <View
     className={`flex-row ${isSmallPhone ? "flex-col" : "justify-between"}`}
   >
     <Input
       className={`${isSmallPhone ? "w-full mb-3" : `w-[${columnWidth}]`}`}
     />
     <Input className={`${isSmallPhone ? "w-full" : `w-[${columnWidth}]`}`} />
   </View>;
   ```

3. **For Content Sections**: Use ResponsiveSheet

   ```tsx
   <ResponsiveSheet title="Section Title" variant="default">
     {/* Content */}
   </ResponsiveSheet>
   ```

4. **For Grid Layouts**: Use ResponsiveGrid
   ```tsx
   <ResponsiveGrid columns="auto" gap={16}>
     <Card />
     <Card />
     <Card />
   </ResponsiveGrid>
   ```

## Available Hook Properties

From `useResponsive()`:

- `width`: Screen width in pixels
- `height`: Screen height in pixels
- `isSmallPhone`: boolean
- `isStandardPhone`: boolean
- `isLargePhone`: boolean
- `isTablet`: boolean
- `isPortrait`: boolean
- `isLandscape`: boolean
- `spacing`: { xs, sm, md, lg, xl } - responsive padding/margin values
- `fontSize`: { xs, sm, base, lg, xl, 2xl, 3xl } - responsive font sizes
- `contentPadding`: Main content area padding
- `columnWidth`: Width for two-column layouts
- `iconSize`: { sm, md, lg, xl } - responsive icon sizes
- `buttonHeight`: Responsive button height
- `inputHeight`: Responsive input height

## Testing on Different Devices

1. **Small Phones** (< 375px): iPhone SE, older devices
2. **Standard Phones** (375-411px): iPhone 13, 14
3. **Large Phones** (412-479px): iPhone Pro Max, Samsung Galaxy
4. **Tablets** (≥ 600px): iPad, large tablets

All screens should be tested on these device sizes to ensure proper layout.
