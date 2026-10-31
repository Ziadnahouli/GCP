import * as React from 'react';
import { UserStatus } from '@/lib/types/profile';
import { cn } from '@/lib/utils';

interface StatusIndicatorProps {
  status: UserStatus;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  showTooltip?: boolean;
}

const SIZE_CLASSES = {
  xs: 'w-2 h-2',
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
  lg: 'w-3.5 h-3.5',
};

const STATUS_LABELS: Record<UserStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Offline',
  unknown: 'Status Unknown',
};

export function StatusIndicator({
  status = 'offline',
  size = 'sm',
  className,
}: StatusIndicatorProps) {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.sm;
  const label = STATUS_LABELS[status] || 'Offline';

  return (
    <span
      className={cn(
        'relative inline-flex items-center justify-center shrink-0 rounded-full transition-colors',
        sizeClass,
        status === 'online' && 'bg-success',
        status === 'idle' && 'bg-warning',
        status === 'dnd' && 'bg-danger',
        status === 'offline' && 'border-2 border-muted-foreground/60 bg-transparent',
        status === 'unknown' && 'border border-muted-foreground/40 bg-muted/60 animate-pulse',
        className
      )}
      title={label}
      aria-label={label}
      role="status"
    >
      {/* Do Not Disturb inner horizontal bar */}
      {status === 'dnd' && (
        <span
          className={cn(
            'bg-card rounded-full',
            size === 'xs' ? 'w-1 h-0.5' : 'w-1.5 h-0.5'
          )}
        />
      )}

      {/* Idle crescent cut-out */}
      {status === 'idle' && (
        <span
          className={cn(
            'absolute -top-0.5 -left-0.5 rounded-full bg-background',
            size === 'xs' ? 'w-1.5 h-1.5' : 'w-2 h-2'
          )}
        />
      )}

      <span className="sr-only">{label}</span>
    </span>
  );
}
