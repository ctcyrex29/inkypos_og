// src/components/ResponsiveSheet.tsx
import React from "react";
import { Text, View, ViewProps } from "react-native";
import { useResponsive } from "../utils/responsive";

interface ResponsiveSheetProps extends ViewProps {
  title?: string;
  children: React.ReactNode;
  variant?: "default" | "compact" | "spacious";
}

/**
 * ResponsiveSheet provides auto-scaling card/sheet layout based on device size
 * Useful for forms, lists, and content sections
 */
export function ResponsiveSheet({
  title,
  children,
  variant = "default",
  className = "",
  ...props
}: ResponsiveSheetProps) {
  const { contentPadding, isSmallPhone, spacing } = useResponsive();

  let paddingClass = "p-4";
  let marginBottomClass = "mb-4";

  if (variant === "compact") {
    paddingClass = isSmallPhone ? "p-2" : "p-3";
    marginBottomClass = "mb-2";
  } else if (variant === "spacious") {
    paddingClass = isSmallPhone ? "p-5" : "p-6";
    marginBottomClass = "mb-6";
  }

  return (
    <View
      className={`bg-white dark:bg-[#071A34] rounded-xl border border-slate-200 dark:border-[#1C2F50] ${paddingClass} ${marginBottomClass} ${className}`}
      {...props}
    >
      {title && (
        <Text className="text-sm font-bold text-slate-800 dark:text-white mb-3">
          {title}
        </Text>
      )}
      {children}
    </View>
  );
}

/**
 * ResponsiveGrid provides responsive grid layout that adapts to screen size
 * Automatically switches between 1, 2, or 3 columns based on device width
 */
interface ResponsiveGridProps extends ViewProps {
  children: React.ReactNode;
  columns?: "auto" | number;
  gap?: number;
}

export function ResponsiveGrid({
  children,
  columns = "auto",
  gap = 12,
  className = "",
  ...props
}: ResponsiveGridProps) {
  const { isSmallPhone, isTablet } = useResponsive();

  let columnCount = 1;
  if (columns === "auto") {
    columnCount = isTablet ? 3 : isSmallPhone ? 1 : 2;
  } else {
    columnCount = columns;
  }

  const childArray = React.Children.toArray(children);
  const rows = [];

  for (let i = 0; i < childArray.length; i += columnCount) {
    rows.push(childArray.slice(i, i + columnCount));
  }

  return (
    <View className={className} {...props}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row gap-3 mb-3">
          {row.map((child, colIndex) => (
            <View key={colIndex} style={{ flex: 1 }}>
              {child}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
