'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { UserBadgeItem } from '@/lib/types/profile';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface UserNameProps {
  displayName?: string | null;
  username?: string | null;
  pronouns?: string | null;
  roleColor?: string | null;
  badges?: UserBadgeItem[];
  showUsername?: boolean;
  className?: string;
  nameClassName?: string;
  size?: 'sm' | 'base' | 'lg';
}

export const UserName: React.FC<UserNameProps> = ({
  displayName,
  username,
  pronouns,
  roleColor,
  badges,
  showUsername = false,
  className,
  nameClassName,
  size = 'base',
}) => {
  const effectiveName = displayName || username || 'User';

  const sizeStyles = {
    sm: 'text-xs',
    base: 'text-sm font-semibold',
    lg: 'text-base font-bold',
  }[size];

  return (
    <div className={cn('inline-flex flex-wrap items-center gap-1.5 min-w-0', className)}>
      <span
        dir="auto"
        className={cn(
          'truncate transition-colors text-foreground',
          sizeStyles,
          nameClassName
        )}
        style={roleColor ? { color: roleColor } : undefined}
      >
        {effectiveName}
      </span>

      {/* Optional @username subtitle if requested */}
      {showUsername && username && (
        <span className="text-xs text-muted-foreground font-mono font-normal">
          @{username}
        </span>
      )}

      {/* Pronouns Chip */}
      {pronouns && (
        <span
          dir="auto"
          className="px-1.5 py-0.5 rounded-full bg-muted/70 border border-border text-[11px] font-normal text-muted-foreground leading-none"
        >
          {pronouns}
        </span>
      )}

      {/* System Badges */}
      {badges && badges.length > 0 && (
        <div className="flex items-center gap-1 shrink-0">
          <TooltipProvider delayDuration={200}>
            {badges.map((badge) => (
              <Tooltip key={badge.id}>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold cursor-default select-none"
                    aria-label={badge.name}
                  >
                    {badge.icon_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={badge.icon_url}
                        alt=""
                        className="w-3.5 h-3.5 object-contain"
                        loading="lazy"
                      />
                    ) : (
                      badge.name.charAt(0).toUpperCase()
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-xs">
                  <div className="font-semibold">{badge.name}</div>
                  {badge.description && (
                    <div className="text-muted-foreground text-[11px] mt-0.5">
                      {badge.description}
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>
      )}
    </div>
  );
};

