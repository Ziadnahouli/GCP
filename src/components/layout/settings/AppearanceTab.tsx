'use client';

import * as React from 'react';
import {
  Sun,
  Moon,
  Laptop,
  Check,
  Sparkles,
  Sliders,
  Type,
  Minimize2,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { AccentTheme } from '@/lib/types/profile';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface AccentOption {
  id: AccentTheme;
  name: string;
  desc: string;
}

const ACCENT_OPTIONS: AccentOption[] = [
  { id: 'violet', name: 'Violet', desc: 'Linear-inspired cyber violet' },
  { id: 'cyan', name: 'Cyan', desc: 'Cool energetic cyan hue' },
  { id: 'emerald', name: 'Emerald', desc: 'Calm balanced emerald green' },
  { id: 'crimson', name: 'Crimson', desc: 'Vibrant punchy crimson' },
  { id: 'amber', name: 'Amber', desc: 'Warm focused solar amber' },
];

export function AppearanceTab() {
  const { settings, updateSettings } = useAuth();
  const { toast } = useToast();

  const currentThemeMode = (settings?.theme_mode || 'system') as 'system' | 'light' | 'dark';
  const currentAccent = (settings?.accent_color || 'violet') as AccentTheme;
  const currentDensity = (settings?.density || 'comfortable') as 'comfortable' | 'compact';
  const currentTextScale = settings?.text_scale || '100';
  const currentReduceMotion = Boolean(settings?.reduce_motion);

  const handleSetThemeMode = async (mode: 'system' | 'light' | 'dark') => {
    const res = await updateSettings({ theme_mode: mode });
    if (res?.error) {
      toast({ title: 'Failed to update theme mode', description: res.error, type: 'error' });
    } else {
      toast({
        title: 'Theme updated',
        description: `Theme mode set to ${mode.charAt(0).toUpperCase() + mode.slice(1)}.`,
        type: 'info',
        duration: 1500,
      });
    }
  };

  const handleSetAccent = async (accent: AccentTheme) => {
    const res = await updateSettings({ accent_color: accent });
    if (res?.error) {
      toast({ title: 'Failed to update accent', description: res.error, type: 'error' });
    } else {
      toast({
        title: 'Accent applied',
        description: `Accent color updated to ${accent}.`,
        type: 'info',
        duration: 1500,
      });
    }
  };

  const handleSetDensity = async (density: 'comfortable' | 'compact') => {
    const res = await updateSettings({ density });
    if (res?.error) {
      toast({ title: 'Failed to update density', description: res.error, type: 'error' });
    } else {
      toast({
        title: 'Density updated',
        description: `Layout density set to ${density}.`,
        type: 'info',
        duration: 1500,
      });
    }
  };

  const handleSetTextScale = async (scale: string) => {
    const res = await updateSettings({ text_scale: scale });
    if (res?.error) {
      toast({ title: 'Failed to update text scale', description: res.error, type: 'error' });
    } else {
      toast({
        title: 'Text scale updated',
        description: `Font scale set to ${scale}%.`,
        type: 'info',
        duration: 1500,
      });
    }
  };

  const handleToggleReduceMotion = async (enabled: boolean) => {
    const res = await updateSettings({ reduce_motion: enabled });
    if (res?.error) {
      toast({ title: 'Failed to update motion preference', description: res.error, type: 'error' });
    } else {
      toast({
        title: enabled ? 'Reduced motion enabled' : 'Reduced motion disabled',
        description: enabled ? 'Non-essential animations are turned off.' : 'Animations restored.',
        type: 'info',
        duration: 1500,
      });
    }
  };

  return (
    <div className="space-y-6 max-w-3xl w-full pb-16">
      <div>
        <h3 className="text-base font-semibold text-foreground">Appearance</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Customize color mode, accent palette, density, and typography scale.
        </p>
      </div>

      {/* 1. Theme Mode (System / Light / Dark) */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">
          Theme Mode
        </label>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { id: 'system' as const, label: 'System', icon: Laptop, desc: 'Sync with OS' },
            { id: 'light' as const, label: 'Light', icon: Sun, desc: 'Clean bright mode' },
            { id: 'dark' as const, label: 'Dark', icon: Moon, desc: 'Sleek dark mode' },
          ].map((item) => {
            const isSelected = currentThemeMode === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSetThemeMode(item.id)}
                className={cn(
                  'flex flex-col items-center justify-center p-3.5 rounded-card border text-center transition-all cursor-pointer relative',
                  isSelected
                    ? 'bg-primary-subtle border-primary text-primary font-semibold shadow-subtle'
                    : 'bg-card border-border hover:bg-surface-hover text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-5 h-5 mb-1.5" />
                <span className="text-xs font-medium">{item.label}</span>
                <span className="text-xs opacity-70 mt-0.5 font-normal">{item.desc}</span>
                {isSelected && (
                  <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Accent Color Palette */}
      <div className="space-y-2 pt-2 border-t border-border">
        <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">
          Accent Color
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {ACCENT_OPTIONS.map((theme) => {
            const isSelected = currentAccent === theme.id;
            return (
              <div
                key={theme.id}
                onClick={() => handleSetAccent(theme.id)}
                className={cn(
                  'flex items-center justify-between p-3 rounded-card border cursor-pointer transition-all',
                  isSelected
                    ? 'bg-card border-primary ring-1 ring-primary shadow-subtle'
                    : 'bg-card border-border hover:bg-surface-hover'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    data-theme={theme.id}
                    className="w-7 h-7 rounded-control shadow-sm flex items-center justify-center text-primary-foreground bg-primary"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <span>{theme.name}</span>
                      {isSelected && (
                        <Badge variant="accent" className="text-xs px-1.5 py-0">
                          Active
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{theme.desc}</div>
                  </div>
                </div>

                {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Layout Density */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">
              Display Density
            </label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Control spacing across messages, sidebars, and friend lists.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => handleSetDensity('comfortable')}
            className={cn(
              'p-3 rounded-card border text-left transition-all',
              currentDensity === 'comfortable'
                ? 'bg-primary-subtle border-primary text-primary font-semibold'
                : 'bg-card border-border hover:bg-surface-hover text-muted-foreground hover:text-foreground'
            )}
          >
            <div className="text-xs font-semibold">Comfortable</div>
            <div className="text-xs opacity-75 mt-0.5 font-normal">
              Generous padding and larger touch targets.
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSetDensity('compact')}
            className={cn(
              'p-3 rounded-card border text-left transition-all',
              currentDensity === 'compact'
                ? 'bg-primary-subtle border-primary text-primary font-semibold'
                : 'bg-card border-border hover:bg-surface-hover text-muted-foreground hover:text-foreground'
            )}
          >
            <div className="text-xs font-semibold">Compact</div>
            <div className="text-xs opacity-75 mt-0.5 font-normal">
              High-information density with tighter row spacing.
            </div>
          </button>
        </div>
      </div>

      {/* 4. Text Scaling */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div>
          <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">
            Font Scaling
          </label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Adjust the global text size without zooming the viewport.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2 pt-1">
          {[
            { scale: '90', label: '90%', sub: 'Small' },
            { scale: '100', label: '100%', sub: 'Default' },
            { scale: '112', label: '112%', sub: 'Medium' },
            { scale: '125', label: '125%', sub: 'Large' },
          ].map((item) => {
            const isSelected = currentTextScale === item.scale;
            return (
              <button
                key={item.scale}
                type="button"
                onClick={() => handleSetTextScale(item.scale)}
                className={cn(
                  'p-2.5 rounded-control border text-center transition-all',
                  isSelected
                    ? 'bg-primary-subtle border-primary text-primary font-semibold'
                    : 'bg-card border-border hover:bg-surface-hover text-muted-foreground hover:text-foreground'
                )}
              >
                <div className="text-xs font-semibold">{item.label}</div>
                <div className="text-xs opacity-75 font-normal">{item.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Reduced Motion */}
      <div className="pt-2 border-t border-border flex items-center justify-between p-3.5 rounded-card bg-card border">
        <div>
          <div className="text-xs font-semibold text-foreground flex items-center gap-2">
            <Minimize2 className="w-4 h-4 text-primary" />
            <span>Reduce Motion</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Disable non-essential micro-animations and smooth sliding transitions.
          </div>
        </div>

        <Switch
          checked={currentReduceMotion}
          onCheckedChange={handleToggleReduceMotion}
          aria-label="Reduce motion toggle"
        />
      </div>
    </div>
  );
}
