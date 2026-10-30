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
import { Channel } from '@/lib/types/server';

interface DeleteChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: Channel | null;
  isLastTextChannel?: boolean;
  onConfirm: () => Promise<void>;
}

export function DeleteChannelDialog({
  open,
  onOpenChange,
  channel,
  isLastTextChannel = false,
  onConfirm,
}: DeleteChannelDialogProps) {
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (open) {
      setSubmitting(false);
    }
  }, [open]);

  const handleDelete = async () => {
    if (isLastTextChannel) return;
    setSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!channel) return null;

  const channelPrefix = channel.type === 'text' ? '#' : '🔊 ';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-5 h-5" />
            Delete Channel
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <span className="font-semibold text-foreground">{channelPrefix}{channel.name}</span>?
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-3">
          {isLastTextChannel ? (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>You cannot delete the last text channel in this server. Every server must have at least one text channel.</span>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>This will permanently delete this channel and all of its messages and media history. This action cannot be undone.</span>
            </div>
          )}
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
            onClick={handleDelete}
            disabled={submitting || isLastTextChannel}
          >
            {submitting ? 'Deleting...' : 'Delete Channel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
