'use client';

import * as React from 'react';
import { UserMinus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ServerMember } from '@/lib/types/server';

interface KickMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: ServerMember | null;
  onConfirm: (reason: string) => Promise<void>;
}

export function KickMemberDialog({
  open,
  onOpenChange,
  member,
  onConfirm,
}: KickMemberDialogProps) {
  const [reason, setReason] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (open) {
      setReason('');
      setSubmitting(false);
    }
  }, [open]);

  const handleKick = async () => {
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const memberName =
    member?.profile?.display_name || member?.profile?.username || 'this user';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <UserMinus className="w-5 h-5" />
            Kick {memberName}
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to kick {memberName}? They will be removed from the server,
            but they can rejoin if they have a valid invite link.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reason for Kick (Optional)
            </label>
            <span className="text-xs text-muted-foreground">{reason.length}/500</span>
          </div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder="Reason for kicking..."
            rows={3}
            className="resize-none text-xs"
          />
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
            onClick={handleKick}
            disabled={submitting}
          >
            {submitting ? 'Kicking...' : 'Confirm Kick'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
