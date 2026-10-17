'use client';

import * as React from 'react';

/**
 * Hook to ensure sensible Escape key behavior across all modals and popups.
 */
export function useModalEscape(open: boolean, onOpenChange: (open: boolean) => void) {
  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onOpenChange]);
}
