'use client';

import * as React from 'react';
import { Search, Bell, Radio, Menu, ShieldCheck } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/features/auth/auth-provider';
import { useNotifications } from '@/hooks/use-notifications';
import { NotificationsPopover } from '@/components/notifications/notifications-popover';
import { cn } from '@/lib/utils';

const ZeroTierModal = dynamic(
  () => import('@/components/network/zerotier-modal').then((m) => m.ZeroTierModal),
  { ssr: false }
);

const GlobalSearchModal = dynamic(
  () => import('@/components/search/global-search-modal').then((m) => m.GlobalSearchModal),
  { ssr: false }
);

interface NavHeaderProps {
  title?: string;
  subtitle?: string;
  onOpenMobileMenu?: () => void;
  onOpenSettings?: () => void;
  onOpenSoundboard?: () => void;
}

export function NavHeader({
  title = 'Friends & Activity',
  subtitle,
  onOpenMobileMenu,
  onOpenSettings,
  onOpenSoundboard,
}: NavHeaderProps) {
  const { isConfigured } = useAuth();
  const [showZeroTier, setShowZeroTier] = React.useState(false);
  const [showSearchModal, setShowSearchModal] = React.useState(false);
  const [showNotifications, setShowNotifications] = React.useState(false);

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotifications();

  // Listen for custom open events dispatched from other shortcuts/actions
  React.useEffect(() => {
    const handleOpenSearch = () => setShowSearchModal(true);
    const handleOpenNotifs = () => setShowNotifications((prev) => !prev);

    window.addEventListener('nexus-open-global-search', handleOpenSearch);
    window.addEventListener('nexus-open-notifications', handleOpenNotifs);

    return () => {
      window.removeEventListener('nexus-open-global-search', handleOpenSearch);
      window.removeEventListener('nexus-open-notifications', handleOpenNotifs);
    };
  }, []);

  return (
    <header className="relative h-[52px] min-h-[52px] border-b border-border bg-surface-header px-3 sm:px-4 flex items-center justify-between shrink-0 select-none z-30">
      {/* Title & Mobile Menu Trigger */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-1.5 -ml-1 text-muted-foreground hover:text-foreground hover:bg-surface-default rounded-lg transition-colors touch-target-44"
            title="Open Server & Channels Menu"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <h1 className="text-body font-semibold text-foreground tracking-tight truncate">{title}</h1>
        {subtitle && (
          <span className="text-meta text-muted-foreground hidden sm:inline truncate font-normal">
            / {subtitle}
          </span>
        )}
      </div>

      {/* Center Search Trigger */}
      <div className="relative w-48 sm:w-64 md:w-72 hidden md:block">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
        <button
          type="button"
          onClick={() => setShowSearchModal(true)}
          className="w-full h-7 pl-8 pr-3 text-xs rounded-lg bg-surface-default/70 border border-border hover:border-border-strong text-muted-foreground/70 hover:text-foreground text-left flex items-center justify-between transition-colors font-normal cursor-pointer"
          aria-label="Quick search command palette"
        >
          <span>Search...</span>
          <kbd className="text-xs font-mono text-muted-foreground/50 border border-border bg-surface-default px-1.5 py-0.2 rounded">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right Controls: Connectivity, Search & Actions */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Mobile Search Button */}
        <button
          type="button"
          onClick={() => setShowSearchModal(true)}
          className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-default transition-colors"
          title="Search"
          aria-label="Quick search"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Hardware Permissions Button */}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('nexus-open-permissions-modal'));
            }
          }}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-success hover:bg-success/10 transition-colors"
          title="Hardware & Browser Permissions"
          aria-label="Hardware & Browser Permissions"
        >
          <ShieldCheck className="w-4 h-4 text-success" />
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
          className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-md text-meta font-medium text-muted-foreground bg-surface-default border border-border"
          title={isConfigured ? 'Supabase Realtime Synced' : 'Local Sandbox Mode'}
        >
          <span className={cn('w-1.5 h-1.5 rounded-full', isConfigured ? 'bg-success' : 'bg-warning')} />
          <span>{isConfigured ? 'Live' : 'Sandbox'}</span>
        </div>

        {/* Notifications Icon Button */}
        <button
          type="button"
          onClick={() => setShowNotifications((prev) => !prev)}
          className={cn(
            'relative p-1.5 rounded-lg transition-colors',
            showNotifications
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-default'
          )}
          title="Notifications Inbox"
          aria-label="Notifications Inbox"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-xs font-bold font-mono text-primary-foreground flex items-center justify-center border border-border">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Notifications Popover Dropdown */}
      <NotificationsPopover
        open={showNotifications}
        onClose={() => setShowNotifications(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
        onDeleteNotification={deleteNotification}
        onClearAll={clearAll}
      />

      {/* Global Search Modal Command Palette */}
      <GlobalSearchModal
        open={showSearchModal}
        onOpenChange={setShowSearchModal}
        onOpenSettings={onOpenSettings}
        onOpenSoundboard={onOpenSoundboard}
      />

      {/* ZeroTier Diagnostics & LAN Modal */}
      <ZeroTierModal open={showZeroTier} onOpenChange={setShowZeroTier} />
    </header>
  );
}
