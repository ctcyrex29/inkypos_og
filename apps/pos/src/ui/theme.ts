import { useColorScheme } from 'react-native';

/**
 * Design tokens shared by every screen on both web and till. Components read
 * these, never raw values. Brand colours come from the InkyPOS logo: deep navy
 * for structure and actions, amber for the one thing that matters most on a
 * screen (taking the payment).
 */
const palette = {
  light: {
    background: '#F2F4F8',
    surface: '#FFFFFF',
    surfaceAlt: '#F7F8FB',
    text: '#0E1A33',
    textMuted: '#5D6B82',
    border: '#E0E5EE',
    primary: '#1B3A8C',
    onPrimary: '#FFFFFF',
    primarySoft: '#E7EDFA',
    accent: '#FFB300',
    onAccent: '#1F1600',
    hero: '#13285F',
    onHero: '#FFFFFF',
    onHeroMuted: '#B9C6E6',
    success: '#0E8A5F',
    onSuccess: '#FFFFFF',
    warning: '#B45309',
    onWarning: '#FFFFFF',
    danger: '#D92D20',
    onDanger: '#FFFFFF',
    info: '#1B3A8C',
    onInfo: '#FFFFFF',
  },
  dark: {
    background: '#0B1222',
    surface: '#141D31',
    surfaceAlt: '#1A2540',
    text: '#F3F5FA',
    textMuted: '#9AA8C2',
    border: '#26324D',
    primary: '#7EA2FF',
    onPrimary: '#071230',
    primarySoft: '#1D2B4F',
    accent: '#FFC233',
    onAccent: '#1F1600',
    hero: '#13285F',
    onHero: '#FFFFFF',
    onHeroMuted: '#B9C6E6',
    success: '#34D399',
    onSuccess: '#04261A',
    warning: '#FBBF24',
    onWarning: '#2A1A00',
    danger: '#F87171',
    onDanger: '#2B0505',
    info: '#7EA2FF',
    onInfo: '#071230',
  },
} as const;

/** Spacing scale (pixels) */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;

/** Border radius scale (pixels) */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  full: 9999,
} as const;

/** Font sizes (pixels) */
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 30,
  huge: 38,
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

/** A soft shadow for raised surfaces (cards, the bottom bar). */
export const elevation = {
  shadowColor: '#0E1A33',
  shadowOpacity: 0.07,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;
