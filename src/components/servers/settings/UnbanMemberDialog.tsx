'use client';

import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ServerBan } from '@/lib/types/server';

interface UnbanMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ban: ServerBan | null;
  onConfirm: () => Promise<void>;
}

export function UnbanMemberDialog({
  open,
  onOpenChange,
  ban,
  onConfirm,
}: UnbanMemberDialogProps) {
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (open) {
      setSubmitting(false);
    }
  }, [open]);

  const handleUnban = async () => {
    if (!ban) return;
    setSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!ban) return null;

  const targetName =
    ban.profile?.display_name || ban.profile?.username || 'this user';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <ShieldCheck className="w-5 h-5" />
            Unban {targetName}
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to lift the server ban for {targetName}? A notification message will be sent to them informing them that they have been unbanned.
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
            onClick={handleUnban}
            disabled={submitting}
          >
            {submitting ? 'Unbanning...' : 'Confirm Unban'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
