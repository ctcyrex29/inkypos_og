import { useColorScheme } from 'react-native';

/**
 * Design tokens shared by every screen on both web and till.
 * Components read these, never raw values.
 * Colors match apps/web index.css exactly (using hex equivalents).
 */
const palette = {
  light: {
    background: '#F8FAFC', // slate-50
    surface: '#FFFFFF',    // white
    text: '#0F172A',       // slate-900
    textMuted: '#64748B',  // slate-600
    border: '#E2E8F0',     // slate-200
    primary: '#4F46E5',    // indigo-600
    onPrimary: '#FFFFFF',
    accent: '#EEF2FF',     // indigo-50 (highlight)
    onAccent: '#1E1B4B',   // indigo-900
    success: '#059669',    // green-600
    onSuccess: '#FFFFFF',
    warning: '#B45309',    // yellow-600
    onWarning: '#FFFFFF',
    danger: '#DC2626',     // red-600
    onDanger: '#FFFFFF',
    info: '#4F46E5',       // indigo-600 (same as primary)
    onInfo: '#FFFFFF',
  },
  dark: {
    background: '#1C1C24',  // slate-950
    surface: '#27272E',     // slate-900
    text: '#FAFAFA',        // white
    textMuted: '#B4B4B8',   // slate-400
    border: '#35353D',      // slate-800
    primary: '#A5B4FC',     // indigo-400
    onPrimary: '#0F0F1E',   // almost black
    accent: '#342E65',      // indigo-900
    onAccent: '#A5B4FC',    // indigo-400
    success: '#34D399',     // green-500
    onSuccess: '#FFFFFF',
    warning: '#FBBF24',     // yellow-500
    onWarning: '#FFFFFF',
    danger: '#F87171',      // red-500
    onDanger: '#FFFFFF',
    info: '#A5B4FC',        // indigo-400
    onInfo: '#0F0F1E',
  },
} as const;

/** Spacing scale (pixels) */
export const spacing = {
  xs: 4,    // 0.25rem
  sm: 8,    // 0.5rem
  md: 12,   // 0.75rem
  lg: 16,   // 1rem
  xl: 24,   // 1.5rem
  xxl: 32,  // 2rem
  xxxl: 48, // 3rem
  huge: 64, // 4rem
} as const;

/** Border radius scale (pixels) */
export const radius = {
  sm: 6,    // 0.375rem
  md: 8,    // 0.5rem
  lg: 10,   // 0.625rem (matches web --radius)
  xl: 12,   // 0.75rem
  full: 9999,
} as const;

/** Font sizes (pixels) */
export const fontSize = {
  xs: 12,   // 0.75rem
  sm: 14,   // 0.875rem
  md: 16,   // 1rem (base)
  lg: 18,   // 1.125rem
  xl: 20,   // 1.25rem
  xxl: 24,  // 1.5rem
  xxxl: 30, // 1.875rem
  huge: 36, // 2.25rem
} as const;

/** Line heights */
export const lineHeight = {
  tight: 1.25,
  normal: 1.5,
  relaxed: 1.75,
} as const;

export type Colors = { [K in keyof (typeof palette)['light']]: string };

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}
