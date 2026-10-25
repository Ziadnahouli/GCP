'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ResizableSidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
  children: React.ReactNode;
}

export function ResizableSidebar({
  defaultWidth = 248,
  minWidth = 220,
  maxWidth = 320,
  storageKey = 'nexus_sidebar_width',
  className,
  children,
  ...props
}: ResizableSidebarProps) {
  const [width, setWidth] = React.useState<number>(defaultWidth);
  const [isResizing, setIsResizing] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
          setWidth(parsed);
        }
      }
    } catch (e) {
      void e;
    }
  }, [storageKey, minWidth, maxWidth]);

  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = width;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
        setWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        try {
          localStorage.setItem(storageKey, String(width));
        } catch (err) {
          void err;
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [width, minWidth, maxWidth, storageKey]
  );

  return (
    <div
      style={{ width: `${width}px` }}
      className={cn(
        'relative flex flex-col shrink-0 border-r border-border bg-surface-sidebar select-none transition-[width] duration-75',
        isResizing && 'transition-none select-none',
        className
      )}
      {...props}
    >
      {children}
      {/* 4px Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          'absolute -right-1 top-0 bottom-0 w-2 cursor-col-resize z-20 group hover:bg-primary/20 transition-colors',
          isResizing && 'bg-primary/40'
        )}
        title="Drag to resize sidebar"
      />
    </div>
  );
}
