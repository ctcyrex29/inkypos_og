import { useColorScheme } from 'react-native';

/**
 * Design tokens shared by every screen. Components read these, never raw values.
 * Matches the web back office and portal (apps/web, shadcn/ui slate + InkyPOS indigo).
 */
const palette = {
  light: {
    background: '#F8FAFC', // slate-50
    surface: '#FFFFFF',
    text: '#0F172A', // slate-900
    textMuted: '#64748B', // slate-500
    border: '#E2E8F0', // slate-200
    primary: '#4F46E5', // indigo-600
    onPrimary: '#FFFFFF',
    accent: '#EEF2FF', // indigo-50, selected chips and highlights
    success: '#059669',
    warning: '#B45309',
    danger: '#DC2626',
  },
  dark: {
    background: '#0B1120',
    surface: '#111827',
    text: '#F1F5F9',
    textMuted: '#94A3B8',
    border: '#1E293B',
    primary: '#818CF8', // indigo-400
    onPrimary: '#0B1120',
    accent: '#1E1B4B',
    success: '#34D399',
    warning: '#FBBF24',
    danger: '#F87171',
  },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 8, lg: 12 } as const;
export const fontSize = { sm: 13, md: 15, lg: 18, xl: 24, xxl: 32 } as const;

export type Colors = { [K in keyof (typeof palette)['light']]: string };

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}
