'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light' | 'oled' | 'high-contrast';
export type AccentColor = 'indigo' | 'cyan' | 'emerald' | 'crimson' | 'amber' | 'silver';

export interface ThemeContextType {
  theme: ThemeMode;
  accent: AccentColor;
  setTheme: (t: ThemeMode) => void;
  setAccent: (a: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [accent, setAccentState] = useState<AccentColor>('indigo');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedTheme = 
      (localStorage.getItem('veloq_theme') as ThemeMode) ||
      (localStorage.getItem('gcp_theme') as ThemeMode) ||
      'dark';
    const savedAccent = 
      (localStorage.getItem('veloq_accent') as AccentColor) ||
      (localStorage.getItem('gcp_accent') as AccentColor) ||
      'indigo';

    setThemeState(savedTheme);
    setAccentState(savedAccent);
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.documentElement.setAttribute('data-accent', savedAccent);
  }, []);

  const setTheme = (t: ThemeMode) => {
    setThemeState(t);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', t);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('veloq_theme', t);
      localStorage.setItem('gcp_theme', t);
    }
  };

  const setAccent = (a: AccentColor) => {
    setAccentState(a);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-accent', a);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('veloq_accent', a);
      localStorage.setItem('gcp_accent', a);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, accent, setTheme, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
