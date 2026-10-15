'use client';

import * as React from 'react';
import { Search, Bell, Wifi, ShieldAlert, Sparkles, Terminal, Radio, Menu, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { Badge } from '@/components/ui/badge';
import { ZeroTierModal } from '@/components/network/zerotier-modal';
import { cn } from '@/lib/utils';

interface NavHeaderProps {
  title?: string;
  subtitle?: string;
  onOpenMobileMenu?: () => void;
}

export function NavHeader({ title = 'Friends & Activity', subtitle, onOpenMobileMenu }: NavHeaderProps) {
  const { isConfigured } = useAuth();
  const [showZeroTier, setShowZeroTier] = React.useState(false);

  return (
    <header className="h-12 border-b border-white/[0.06] bg-surface-header px-3 sm:px-4 flex items-center justify-between shrink-0 select-none z-10">
      {/* Title & Mobile Menu Trigger */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-1.5 -ml-1 text-muted-foreground hover:text-foreground hover:bg-white/[0.04] rounded-lg transition-colors"
            title="Open Server & Channels Menu"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <h1 className="text-xs font-semibold text-foreground tracking-tight truncate">{title}</h1>
        {subtitle && (
          <span className="text-[11px] text-muted-foreground/70 hidden sm:inline truncate font-normal">
            / {subtitle}
          </span>
        )}
      </div>

      {/* Center Search Input */}
      <div className="relative w-48 sm:w-64 md:w-72 hidden md:block">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
        <input
          id="global-search-input"
          type="text"
          placeholder="Search... [Ctrl+K]"
          aria-label="Quick search"
          className="w-full h-7 pl-8 pr-3 text-xs rounded-lg bg-surface-default/70 border border-white/[0.06] hover:border-white/[0.12] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50 transition-colors font-normal"
        />
      </div>

      {/* Right Controls: Connectivity & Actions */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Hardware Permissions Button */}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('nexus-open-permissions-modal'));
            }
          }}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          title="Hardware & Browser Permissions"
          aria-label="Hardware & Browser Permissions"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
        </button>

        {/* ZeroTier Direct LAN Indicator */}
        <button
          type="button"
          onClick={() => setShowZeroTier(true)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors relative"
          title="Direct P2P LAN / ZeroTier Network"
          aria-label="Direct P2P LAN / ZeroTier Network"
        >
          <Radio className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
        </button>

        {/* Cloud Sync Status Indicator */}
        <div
          className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] text-muted-foreground font-mono bg-white/[0.02] border border-white/[0.04]"
          title={isConfigured ? 'Supabase Realtime Synced' : 'Local Sandbox Mode'}
        >
          <span className={cn('w-1.5 h-1.5 rounded-full', isConfigured ? 'bg-emerald-400' : 'bg-amber-400')} />
          <span>{isConfigured ? 'Live' : 'Sandbox'}</span>
        </div>

        {/* Notifications Icon */}
        <button
          type="button"
          className="relative p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
        </button>
      </div>

      {/* ZeroTier Diagnostics & LAN Modal */}
      <ZeroTierModal open={showZeroTier} onOpenChange={setShowZeroTier} />
    </header>
  );
}
