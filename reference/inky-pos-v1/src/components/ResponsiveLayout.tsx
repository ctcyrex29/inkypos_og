// src/components/ResponsiveLayout.tsx
import React from "react";
import { ScrollView, ScrollViewProps, View, ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useResponsive } from "../utils/responsive";

interface ResponsiveLayoutProps extends ViewProps {
  children: React.ReactNode;
  scrollable?: boolean;
  backgroundColor?: string;
}

/**
 * ResponsiveLayout wraps screens with SafeAreaView and responsive padding
 * Automatically adjusts content padding based on screen size
 */
export function ResponsiveLayout({
  children,
  scrollable = false,
  backgroundColor = "bg-slate-50 dark:bg-slate-950",
  className = "",
  ...props
}: ResponsiveLayoutProps) {
  const { contentPadding, isSmallPhone } = useResponsive();

  const content = (
    <View className={`flex-1 ${backgroundColor} ${className}`} {...props}>
      {children}
    </View>
  );

  if (scrollable) {
    return (
      <SafeAreaView className={`flex-1 ${backgroundColor}`}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: contentPadding }}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className={`flex-1 ${backgroundColor}`}>
      {content}
    </SafeAreaView>
  );
}

/**
 * ResponsiveScrollView provides auto-adjusting ScrollView with responsive padding
 */
export function ResponsiveScrollView({
  children,
  backgroundColor = "bg-slate-50 dark:bg-slate-950",
  contentClassName = "",
  ...props
}: ScrollViewProps & { backgroundColor?: string; contentClassName?: string }) {
  const { contentPadding } = useResponsive();

  return (
    <SafeAreaView className={`flex-1 ${backgroundColor}`}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: contentPadding }}
        {...props}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
