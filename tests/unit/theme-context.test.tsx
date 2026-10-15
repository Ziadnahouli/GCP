import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as React from 'react';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';

describe('Theme Engine & Dynamic Accents', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-accent');
  });

  it('initializes with default dark theme and indigo accent', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe('dark');
    expect(result.current.accent).toBe('indigo');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-accent')).toBe('indigo');
  });

  it('switches between Light, OLED Black, and High-Contrast WCAG AAA themes', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );

    const { result } = renderHook(() => useTheme(), { wrapper });

    // Switch to light
    act(() => {
      result.current.setTheme('light');
    });
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('veloq_theme')).toBe('light');

    // Switch to OLED pure black
    act(() => {
      result.current.setTheme('oled');
    });
    expect(result.current.theme).toBe('oled');
    expect(document.documentElement.getAttribute('data-theme')).toBe('oled');
    expect(localStorage.getItem('veloq_theme')).toBe('oled');

    // Switch to High Contrast (WCAG AAA)
    act(() => {
      result.current.setTheme('high-contrast');
    });
    expect(result.current.theme).toBe('high-contrast');
    expect(document.documentElement.getAttribute('data-theme')).toBe('high-contrast');
    expect(localStorage.getItem('veloq_theme')).toBe('high-contrast');
  });

  it('switches across all 6 accent color variations with persistence', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );

    const { result } = renderHook(() => useTheme(), { wrapper });

    const accents = ['cyan', 'emerald', 'crimson', 'amber', 'silver', 'indigo'] as const;

    for (const accent of accents) {
      act(() => {
        result.current.setAccent(accent);
      });
      expect(result.current.accent).toBe(accent);
      expect(document.documentElement.getAttribute('data-accent')).toBe(accent);
      expect(localStorage.getItem('veloq_accent')).toBe(accent);
    }
  });

  it('restores saved theme and accent preference from localStorage on mount', () => {
    localStorage.setItem('veloq_theme', 'oled');
    localStorage.setItem('veloq_accent', 'crimson');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe('oled');
    expect(result.current.accent).toBe('crimson');
    expect(document.documentElement.getAttribute('data-theme')).toBe('oled');
    expect(document.documentElement.getAttribute('data-accent')).toBe('crimson');
  });
});
