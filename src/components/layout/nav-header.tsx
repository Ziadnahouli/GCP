'use client';

import * as React from 'react';
import { Search, Bell, Wifi, ShieldAlert, Sparkles, Terminal, Radio, Menu, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { Badge } from '@/components/ui/badge';
import { ZeroTierModal } from '@/components/network/zerotier-modal';

interface NavHeaderProps {
  title?: string;
  subtitle?: string;
  onOpenMobileMenu?: () => void;
}

export function NavHeader({ title = 'Friends & Activity', subtitle, onOpenMobileMenu }: NavHeaderProps) {
  const { isConfigured } = useAuth();
  const [showZeroTier, setShowZeroTier] = React.useState(false);

  return (
    <header className="h-14 border-b border-border/80 bg-surface-header/90 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between shrink-0 select-none z-10">
      {/* Title & Mobile Menu Trigger */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-1.5 -ml-1 text-muted-foreground hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
            title="Open Server & Channels Menu"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-sm font-bold text-foreground tracking-tight truncate">{title}</h1>
        {subtitle && (
          <span className="text-xs text-muted-foreground hidden sm:inline truncate">
            • {subtitle}
          </span>
        )}
      </div>

      {/* Center Search Input */}
      <div className="relative w-48 sm:w-64 md:w-80 hidden md:block">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search friends, servers, messages... [Ctrl+K]"
          className="w-full h-8 pl-8 pr-3 text-xs rounded-lg bg-surface-default border border-border/80 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
        />
      </div>

      {/* Right Controls: Connectivity Badge & Notifications */}
      <div className="flex items-center gap-2.5">
        {/* Connectivity Status Badge */}
        {isConfigured ? (
          <Badge
            variant="success"
            className="hidden sm:inline-flex items-center gap-1.5 py-1 px-2.5 text-[11px]"
            title="Connected to Supabase Cloud & Ready for WebRTC"
          >
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span>Cloud Synced</span>
          </Badge>
        ) : (
          <Badge
            variant="warning"
            className="inline-flex items-center gap-1.5 py-1 px-2.5 text-[11px]"
            title="Running in local sandbox mode. Add Supabase keys to .env.local for cloud persistence."
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Local Sandbox</span>
          </Badge>
        )}

        {/* Permissions Quick Button */}
        <button
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('nexus-open-permissions-modal'));
            }
          }}
          className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-[11px] font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors shadow-sm"
          title="Hardware & Browser Permissions"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Permissions</span>
        </button>

        {/* ZeroTier Indicator */}
        <button
          onClick={() => setShowZeroTier(true)}
          className="hidden sm:inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-[11px] font-semibold border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors shadow-sm"
          title="Direct P2P LAN / ZeroTier diagnostic support active"
        >
          <Radio className="w-3 h-3 text-primary animate-pulse" />
          <span>ZeroTier LAN</span>
        </button>

        {/* Notifications Icon */}
        <button
          className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-surface-header" />
        </button>
      </div>

      {/* ZeroTier Diagnostics & LAN Modal */}
      <ZeroTierModal open={showZeroTier} onOpenChange={setShowZeroTier} />
    </header>
  );
}
