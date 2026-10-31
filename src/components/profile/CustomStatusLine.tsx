'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Clock } from 'lucide-react';

interface CustomStatusLineProps {
  emoji?: string | null;
  text?: string | null;
  expiresAt?: string | null;
  className?: string;
}

export const CustomStatusLine: React.FC<CustomStatusLineProps> = ({
  emoji,
  text,
  expiresAt,
  className,
}) => {
  if (!text && !emoji) return null;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 text-xs text-foreground/80 bg-muted/60 px-2.5 py-1 rounded-full border border-border/60 max-w-full',
        className
      )}
    >
      {emoji && <span className="text-sm shrink-0 leading-none">{emoji}</span>}
      {text && <span className="truncate leading-tight font-medium">{text}</span>}
      {expiresAt && (
        <span
          className="text-muted-foreground shrink-0 ml-0.5"
          title={`Status expires at ${new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
        >
          <Clock className="w-3 h-3 inline-block" />
        </span>
      )}
    </div>
  );
};

