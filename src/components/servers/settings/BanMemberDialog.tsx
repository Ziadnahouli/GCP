'use client';

import * as React from 'react';
import { Ban } from 'lucide-react';
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

interface BanMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: ServerMember | null;
  onConfirm: (reason: string) => Promise<void>;
}

export function BanMemberDialog({
  open,
  onOpenChange,
  member,
  onConfirm,
}: BanMemberDialogProps) {
  const [reason, setReason] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (open) {
      setReason('');
      setSubmitting(false);
    }
  }, [open]);

  const handleBan = async () => {
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
            <Ban className="w-5 h-5" />
            Ban {memberName}
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to ban {memberName}? They will be removed from the server
            and will not be able to rejoin unless unbanned.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reason for Ban (Optional)
            </label>
            <span className="text-xs text-muted-foreground">{reason.length}/500</span>
          </div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder="Violations of server rules, disruptive behavior..."
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
            onClick={handleBan}
            disabled={submitting}
          >
            {submitting ? 'Banning...' : 'Confirm Ban'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
