import { useColorScheme } from 'react-native';

/** Design tokens shared by every screen. Components read these, never raw values. */
const palette = {
  light: {
    background: '#F6F7F9',
    surface: '#FFFFFF',
    text: '#14171F',
    textMuted: '#5B6270',
    border: '#DDE1E7',
    primary: '#1B5FD1',
    onPrimary: '#FFFFFF',
    success: '#167A3E',
    warning: '#A15C00',
    danger: '#B42318',
  },
  dark: {
    background: '#0F1115',
    surface: '#181B21',
    text: '#EEF0F4',
    textMuted: '#A3AAB8',
    border: '#2A2F38',
    primary: '#6B9EFF',
    onPrimary: '#0B1220',
    success: '#4CC27A',
    warning: '#F0A33A',
    danger: '#FF7A6E',
  },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16 } as const;
export const fontSize = { sm: 13, md: 15, lg: 18, xl: 24, xxl: 32 } as const;

export type Colors = { [K in keyof (typeof palette)['light']]: string };

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}
