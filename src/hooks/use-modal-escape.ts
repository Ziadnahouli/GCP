'use client';

import * as React from 'react';

// Global LIFO modal stack to ensure nested dialogs close in reverse order of opening
// and pressing Escape only closes the topmost dialog, without closing parent dialogs.
const escapeStack: Array<() => void> = [];

let isGlobalListenerAttached = false;

function ensureGlobalListener() {
  if (typeof window === 'undefined' || isGlobalListenerAttached) return;

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (escapeStack.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        // Invoke only the topmost modal's close handler
        const topClose = escapeStack[escapeStack.length - 1];
        topClose();
      }
    }
  });

  isGlobalListenerAttached = true;
}

/**
 * Hook to ensure sensible Escape key behavior across all modals and popups.
 * Supports arbitrary modal nesting via a LIFO stack.
 */
export function useModalEscape(open: boolean, onOpenChange: (open: boolean) => void) {
  const onOpenChangeRef = React.useRef(onOpenChange);
  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  React.useEffect(() => {
    if (!open) return;

    ensureGlobalListener();

    const closeModal = () => {
      onOpenChangeRef.current(false);
    };

    escapeStack.push(closeModal);

    return () => {
      const index = escapeStack.lastIndexOf(closeModal);
      if (index !== -1) {
        escapeStack.splice(index, 1);
      }
    };
  }, [open]);
}
