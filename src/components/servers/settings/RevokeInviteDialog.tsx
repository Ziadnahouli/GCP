'use client';

import * as React from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ServerInvite } from '@/lib/types/server';

interface RevokeInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invite: ServerInvite | null;
  onConfirm: () => Promise<void>;
}

export function RevokeInviteDialog({
  open,
  onOpenChange,
  invite,
  onConfirm,
}: RevokeInviteDialogProps) {
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (open) {
      setSubmitting(false);
    }
  }, [open]);

  const handleRevoke = async () => {
    if (!invite) return;
    setSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!invite) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-5 h-5" />
            Revoke Invite Link
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to revoke invite code <code className="font-mono font-semibold text-foreground">{invite.code}</code>?
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>
              Anyone with this link will no longer be able to use it to join this server.
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
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
            onClick={handleRevoke}
            disabled={submitting}
          >
            {submitting ? 'Revoking...' : 'Revoke Invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
