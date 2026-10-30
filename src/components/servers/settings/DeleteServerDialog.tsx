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
import { Input } from '@/components/ui/input';
import { Server } from '@/lib/types/server';

interface DeleteServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: Server;
  onConfirm: () => Promise<void>;
}

export function DeleteServerDialog({
  open,
  onOpenChange,
  server,
  onConfirm,
}: DeleteServerDialogProps) {
  const [confirmName, setConfirmName] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (open) {
      setConfirmName('');
      setSubmitting(false);
    }
  }, [open]);

  const channelCount = server.channels?.length || 0;
  const memberCount = server.members?.length || 0;
  const isMatch = confirmName.trim() === server.name;

  const handleDelete = async () => {
    if (!isMatch) return;
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
            <Trash2 className="w-5 h-5" />
            Delete &quot;{server.name}&quot;
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this server? This action cannot be reversed.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-4">
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Permanent Deletion Warning</span>
            </div>
            <p className="text-xs text-destructive/90 leading-relaxed">
              Deleting this server will permanently remove {channelCount} {channelCount === 1 ? 'channel' : 'channels'}, 
              all messages, files, soundboard clips, and disconnect all {memberCount} {memberCount === 1 ? 'member' : 'members'}.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Enter server name to confirm: <span className="text-foreground select-all font-mono font-normal">{server.name}</span>
            </label>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={server.name}
              className="text-sm"
              autoFocus
            />
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
            onClick={handleDelete}
            disabled={submitting || !isMatch}
          >
            {submitting ? 'Deleting...' : 'Delete Server'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
