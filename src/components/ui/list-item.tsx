import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ListItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  selected?: boolean;
  unread?: boolean;
  disabled?: boolean;
  dense?: boolean;
}

export const ListItem = React.forwardRef<HTMLDivElement, ListItemProps>(
  (
    {
      leading,
      title,
      subtitle,
      trailing,
      selected = false,
      unread = false,
      disabled = false,
      dense = false,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-current={selected ? 'true' : undefined}
        data-selected={selected}
        aria-disabled={disabled}
        className={cn(
          'group relative flex w-full items-center gap-2.5 rounded-control px-2 transition-colors duration-fast ease-pro select-none text-left outline-none',
          dense
            ? 'h-7 min-h-[28px]'
            : 'h-8 sm:h-8 min-h-[32px] max-sm:h-14 max-sm:min-h-[56px] max-sm:px-3',
          selected
            ? 'bg-surface-active text-foreground font-medium'
            : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
          disabled && 'pointer-events-none opacity-50',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          className
        )}
        {...props}
      >
        {/* Leading Slot (Avatar, Icon, Status) */}
        {leading && (
          <div className="flex shrink-0 items-center justify-center">
            {leading}
          </div>
        )}

        {/* Content Slot (Title, Subtitle) */}
        <div className="min-w-0 flex-1 truncate">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'truncate text-xs md:text-sm text-foreground',
                unread ? 'font-semibold text-foreground' : selected ? 'font-medium' : 'font-normal'
              )}
            >
              {title}
            </span>
            {unread && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />
            )}
          </div>
          {subtitle && (
            <p className="truncate text-xs leading-tight text-muted-foreground/80 max-sm:text-xs">
              {subtitle}
            </p>
          )}
        </div>

        {/* Trailing Slot (Time, Badge, Action Menu) */}
        {trailing && (
          <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            {trailing}
          </div>
        )}
      </div>
    );
  }
);
ListItem.displayName = 'ListItem';
