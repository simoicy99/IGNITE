import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Design Tokens - Matches Admin Dashboard
export const tokens = {
  colors: {
    // Primary
    primary: {
      50: '#FEF2F2',
      100: '#FEE2E2',
      200: '#FECACA',
      300: '#FCA5A5',
      400: '#F87171',
      500: '#EF4444',
      600: '#DC2626',
      700: '#B91C1C',
      800: '#991B1B',
      900: '#7F1D1D',
    },
    // Gray
    gray: {
      50: '#FAFAFA',
      100: '#F5F5F5',
      200: '#E5E5E5',
      300: '#D4D4D4',
      400: '#A3A3A3',
      500: '#737373',
      600: '#525252',
      700: '#404040',
      800: '#262626',
      900: '#171717',
    },
    // Semantic
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
  },
  
  // 8px Grid System
  space: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
    16: 64,
  },
  
  // Typography
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
  
  // Border Radius
  radius: {
    none: 0,
    sm: 4,
    md: 6,
    lg: 8,
    xl: 12,
    '2xl': 16,
    '3xl': 24,
    full: 9999,
  },
  
  // Shadows (iOS elevation)
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 15,
      elevation: 8,
    },
  },
};

// Theme Context
interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  colors: {
    bg: string;
    bgSecondary: string;
    bgTertiary: string;
    bgElevated: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    textDisabled: string;
    border: string;
    borderStrong: string;
    accent: string;
    accentHover: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
  };
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [isDark, setIsDark] = useState(systemColorScheme === 'dark');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadTheme();
  }, []);

  async function loadTheme() {
    try {
      const savedTheme = await AsyncStorage.getItem('theme');
      if (savedTheme !== null) {
        setIsDark(savedTheme === 'dark');
      }
    } catch (e) {
      console.error('Failed to load theme', e);
    }
    setIsLoaded(true);
  }

  async function toggleTheme() {
    const newTheme = !isDark;
    setIsDark(newTheme);
    try {
      await AsyncStorage.setItem('theme', newTheme ? 'dark' : 'light');
    } catch (e) {
      console.error('Failed to save theme', e);
    }
  }

  const colors = isDark ? {
    bg: '#0A0A0A',
    bgSecondary: '#141414',
    bgTertiary: '#1F1F1F',
    bgElevated: '#2A2A2A',
    text: '#FAFAFA',
    textSecondary: '#A3A3A3',
    textMuted: '#737373',
    textDisabled: '#525252',
    border: '#2A2A2A',
    borderStrong: '#404040',
    accent: '#EF4444',
    accentHover: '#DC2626',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
  } : {
    bg: '#FFFFFF',
    bgSecondary: '#FAFAFA',
    bgTertiary: '#F5F5F5',
    bgElevated: '#FFFFFF',
    text: '#171717',
    textSecondary: '#525252',
    textMuted: '#737373',
    textDisabled: '#A3A3A3',
    border: '#E5E5E5',
    borderStrong: '#D4D4D4',
    accent: '#DC2626',
    accentHover: '#B91C1C',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
  };

  if (!isLoaded) return null;

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

// Utility Components
export function withTheme<T extends object>(
  Component: React.ComponentType<T & { theme: ThemeContextType }>
) {
  return function ThemedComponent(props: T) {
    const theme = useTheme();
    return <Component {...props} theme={theme} />;
  };
}
