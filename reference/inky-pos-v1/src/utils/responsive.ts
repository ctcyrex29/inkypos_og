// src/utils/responsive.ts
import { useWindowDimensions } from "react-native";

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  // Screen size classifications
  const isSmallPhone = width < 375; // iPhone SE, small phones
  const isStandardPhone = width >= 375 && width < 480; // iPhone standard sizes
  const isLargePhone = width >= 480 && width < 768; // large phones and small phablets
  const isTablet = width >= 768 && width < 1024; // tablets
  const isDesktop = width >= 1024; // desktop / large web screens

  // Device orientation
  const isPortrait = height > width;
  const isLandscape = width > height;

  // Sizing helpers
  const spacing = {
    xs: isSmallPhone ? 4 : 6,
    sm: isSmallPhone ? 8 : 12,
    md: isSmallPhone ? 12 : 16,
    lg: isSmallPhone ? 16 : 20,
    xl: isSmallPhone ? 20 : 24,
  };

  // Font sizes
  const fontSize = {
    xs: isSmallPhone ? 10 : 12,
    sm: isSmallPhone ? 12 : 13,
    base: isSmallPhone ? 14 : 16,
    lg: isSmallPhone ? 16 : 18,
    xl: isSmallPhone ? 18 : 20,
    "2xl": isSmallPhone ? 20 : 24,
    "3xl": isSmallPhone ? 24 : 30,
  };

  // Content padding
  const contentPadding = isSmallPhone ? 12 : isStandardPhone ? 16 : 20;

  // Column widths for layouts (e.g., two-column forms)
  const columnWidth = isDesktop
    ? "48%"
    : isTablet
      ? "48%"
      : isLargePhone
        ? "100%"
        : isStandardPhone
          ? "100%"
          : "100%";

  const cardWidth = isDesktop || isTablet ? "48%" : "100%";

  // Icon sizes
  const iconSize = {
    sm: isSmallPhone ? 16 : 18,
    md: isSmallPhone ? 18 : 20,
    lg: isSmallPhone ? 24 : 28,
    xl: isSmallPhone ? 28 : 32,
  };

  // Button heights
  const buttonHeight = isSmallPhone ? 40 : 44;

  // Input heights
  const inputHeight = isSmallPhone ? 40 : 44;

  return {
    width,
    height,
    isSmallPhone,
    isStandardPhone,
    isLargePhone,
    isTablet,
    isDesktop,
    isPortrait,
    isLandscape,
    spacing,
    fontSize,
    contentPadding,
    columnWidth,
    cardWidth,
    iconSize,
    buttonHeight,
    inputHeight,
  };
}

// Preset responsive classes for common layouts
export const responsiveClasses = {
  container: "px-4 py-3.5",
  containerLarge: "px-6 py-4",
  containerSmall: "px-3 py-2",

  // Section padding
  section: "p-4",
  sectionLarge: "p-6",
  sectionSmall: "p-2",

  // Card padding
  card: "p-4",
  cardLarge: "p-6",
  cardSmall: "p-3",

  // Header sizing
  headerSmall: "text-sm",
  headerBase: "text-base",
  headerLarge: "text-lg",
  headerXL: "text-xl",
  header2XL: "text-2xl",

  // Flex layouts responsive
  flexRowResponsive: "flex-row",
  flexColResponsive: "flex-col",
};
