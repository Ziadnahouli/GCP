/**
 * Central design color tokens and data swatches for Nexus.
 * Consolidates all data colors (profile banners, server roles, theme meta).
 */

export const THEME_META_COLORS = {
  light: '#ffffff',
  dark: '#0f1115',
} as const;

export const DEFAULT_BANNER_COLOR = '#7c3aed';

export interface BannerPreset {
  name: string;
  color: string;
}

export const PROFILE_BANNER_PRESETS: readonly BannerPreset[] = [
  { name: 'Cosmic Violet', color: '#7c3aed' },
  { name: 'Cyber Cyan', color: '#0284c7' },
  { name: 'Emerald Ops', color: '#059669' },
  { name: 'Crimson Flare', color: '#e11d48' },
  { name: 'Solar Gold', color: '#d97706' },
  { name: 'Obsidian Zinc', color: '#27272a' },
] as const;

export const DEFAULT_ROLE_COLORS = {
  admin: '#6366f1',
  moderator: '#10b981',
  member: '#94a3b8',
  defaultNewRole: '#6366f1',
} as const;

export const ROLE_PRESET_COLORS: readonly string[] = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
] as const;
