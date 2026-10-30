'use client';

import * as React from 'react';
import { LogOut } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Server } from '@/lib/types/server';

interface LeaveServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: Server;
  onConfirm: () => Promise<void>;
}

export function LeaveServerDialog({
  open,
  onOpenChange,
  server,
  onConfirm,
}: LeaveServerDialogProps) {
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (open) {
      setSubmitting(false);
    }
  }, [open]);

  const handleLeave = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <LogOut className="w-5 h-5" />
            Leave &quot;{server.name}&quot;
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to leave this server? You won&apos;t be able to rejoin unless you are re-invited.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleLeave}
            disabled={submitting}
          >
            {submitting ? 'Leaving...' : 'Leave Server'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
