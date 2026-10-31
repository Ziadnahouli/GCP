'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Gamepad2 } from 'lucide-react';

interface ActivityLineProps {
  activityText?: string | null;
  expiresAt?: string | null;
  className?: string;
}

export const ActivityLine: React.FC<ActivityLineProps> = ({
  activityText,
  expiresAt,
  className,
}) => {
  if (!activityText || !activityText.trim()) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs text-foreground bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-xl font-medium',
        className
      )}
    >
      <Gamepad2 className="w-4 h-4 text-primary shrink-0" />
      <div className="truncate">
        <span className="text-muted-foreground mr-1">Playing</span>
        <span className="text-foreground font-semibold">{activityText}</span>
      </div>
    </div>
  );
};

