'use client';

import * as React from 'react';
import { Clock } from 'lucide-react';
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

interface TimeoutMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: ServerMember | null;
  onConfirm: (durationSeconds: number, reason: string) => Promise<void>;
}

const TIMEOUT_PRESETS = [
  { label: '60 seconds', seconds: 60 },
  { label: '5 minutes', seconds: 300 },
  { label: '10 minutes', seconds: 600 },
  { label: '1 hour', seconds: 3600 },
  { label: '1 day', seconds: 86400 },
  { label: '1 week', seconds: 604800 },
];

export function TimeoutMemberDialog({
  open,
  onOpenChange,
  member,
  onConfirm,
}: TimeoutMemberDialogProps) {
  const [selectedDuration, setSelectedDuration] = React.useState<number>(300);
  const [isCustom, setIsCustom] = React.useState<boolean>(false);
  const [customMinutes, setCustomMinutes] = React.useState<string>('30');
  const [reason, setReason] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (open) {
      setSelectedDuration(300);
      setIsCustom(false);
      setCustomMinutes('30');
      setReason('');
      setSubmitting(false);
    }
  }, [open]);

  const handleApply = async () => {
    let finalSeconds = selectedDuration;
    if (isCustom) {
      const parsedMin = parseInt(customMinutes, 10);
      if (isNaN(parsedMin) || parsedMin <= 0) {
        return;
      }
      finalSeconds = Math.min(parsedMin * 60, 28 * 24 * 60 * 60); // Cap at 28 days
    }

    setSubmitting(true);
    try {
      await onConfirm(finalSeconds, reason.trim());
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const memberName =
    member?.profile?.display_name || member?.profile?.username || 'this member';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            Timeout {memberName}
          </DialogTitle>
          <DialogDescription>
            Temporarily restrict this user from sending messages, speaking in voice
            lounges, and adding reactions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
              Timeout Duration
            </label>
            <div className="grid grid-cols-3 gap-2">
              {TIMEOUT_PRESETS.map((preset) => (
                <Button
                  key={preset.seconds}
                  type="button"
                  variant={
                    !isCustom && selectedDuration === preset.seconds
                      ? 'primary'
                      : 'outline'
                  }
                  size="sm"
                  onClick={() => {
                    setSelectedDuration(preset.seconds);
                    setIsCustom(false);
                  }}
                  className="text-xs"
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <Button
                type="button"
                variant={isCustom ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setIsCustom(true)}
                className="text-xs"
              >
                Custom minutes
              </Button>
              {isCustom && (
                <input
                  type="number"
                  min="1"
                  max="40320"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  className="w-24 px-2 py-1 text-xs rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Minutes"
                />
              )}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Reason (Optional)
              </label>
              <span className="text-xs text-muted-foreground">
                {reason.length}/500
              </span>
            </div>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              placeholder="Provide a reason for the moderation audit log..."
              rows={3}
              className="resize-none text-xs"
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
            variant="primary"
            onClick={handleApply}
            disabled={submitting}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {submitting ? 'Applying...' : 'Apply Timeout'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
