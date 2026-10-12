'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { UserStatus } from '@/lib/types/profile';
import { cn } from '@/lib/utils';

interface StatusOption {
  value: UserStatus;
  label: string;
  description: string;
  color: string;
}

const statusOptions: StatusOption[] = [
  {
    value: 'online',
    label: 'Online',
    description: 'Visible and ready to game',
    color: 'bg-emerald-500',
  },
  {
    value: 'idle',
    label: 'Idle',
    description: 'Away from keyboard / in-game AFK',
    color: 'bg-amber-500',
  },
  {
    value: 'dnd',
    label: 'Do Not Disturb',
    description: 'Will not receive desktop notification sound alerts',
    color: 'bg-rose-500',
  },
  {
    value: 'offline',
    label: 'Invisible',
    description: 'Appear offline to everyone',
    color: 'bg-slate-500',
  },
];

interface StatusSelectorProps {
  currentStatus: UserStatus;
  onSelect: (status: UserStatus) => void;
  onClose: () => void;
  className?: string;
}

export function StatusSelector({ currentStatus, onSelect, onClose, className }: StatusSelectorProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'status-selector-container z-50 w-64 rounded-xl bg-card border border-border/80 shadow-2xl p-1.5 backdrop-blur-md animate-in duration-150',
        className || 'absolute bottom-16 left-2 slide-in-from-bottom-2'
      )}
    >
      <div className="px-2 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase border-b border-border/60 mb-1">
        Change Presence
      </div>

      <div className="space-y-0.5">
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => {
              onSelect(opt.value);
              onClose();
            }}
            className={cn(
              'w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors',
              currentStatus === opt.value
                ? 'bg-primary/15 text-primary'
                : 'hover:bg-surface-hover text-foreground'
            )}
          >
            <div className="flex items-center gap-2.5">
              <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', opt.color)} />
              <div>
                <div className="text-xs font-semibold leading-tight">{opt.label}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  {opt.description}
                </div>
              </div>
            </div>

            {currentStatus === opt.value && <Check className="w-4 h-4 shrink-0 text-primary" />}
          </button>
        ))}
      </div>
    </div>
  );
}
