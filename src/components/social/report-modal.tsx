'use client';

import * as React from 'react';
import { Flag, ShieldAlert, Loader2, Check } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { getBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface ReportModalProps {
  reportedUserId: string | null;
  reportedUserName?: string;
  serverId?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReportSubmitted?: () => void;
}

const REPORT_REASONS = [
  { id: 'harassment', label: 'Harassment or Toxicity', desc: 'Bullying, targeted abuse, hate speech' },
  { id: 'spam', label: 'Spam or Scam', desc: 'Unsolicited links, malicious promotions, phishing' },
  { id: 'inappropriate', label: 'Inappropriate Content', desc: 'Explicit, gory, or harmful media' },
  { id: 'cheating', label: 'Cheating or Exploits', desc: 'Game hacks, botting, malicious client usage' },
  { id: 'other', label: 'Other Safety Issue', desc: 'Other terms or community code violations' },
];

export function ReportModal({
  reportedUserId,
  reportedUserName = 'User',
  serverId = null,
  channelId = null,
  messageId = null,
  open,
  onOpenChange,
  onReportSubmitted,
}: ReportModalProps) {
  const { toast } = useToast();
  const supabase = React.useMemo(() => getBrowserClient(), []);

  const [selectedReason, setSelectedReason] = React.useState('harassment');
  const [details, setDetails] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setSelectedReason('harassment');
      setDetails('');
      setIsSubmitting(false);
    }
  }, [open]);

  if (!reportedUserId) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('create_report', {
        p_reported_user_id: reportedUserId,
        p_reason: selectedReason,
        p_server_id: serverId || null,
        p_channel_id: channelId || null,
        p_message_id: messageId || null,
        p_details: details.trim() || null,
      });

      if (error) throw error;

      toast({
        title: 'Report Submitted',
        description: 'Thank you for keeping GCP safe. Our moderation team will review this report.',
        type: 'success',
      });

      onOpenChange(false);
      onReportSubmitted?.();
    } catch (err: any) {
      toast({
        title: 'Report Failed',
        description: err?.message || 'Could not submit report.',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md w-full p-6 border border-white/[0.08] bg-[#0c0d14] text-foreground rounded-2xl shadow-2xl"
        onClose={() => onOpenChange(false)}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <Flag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Report Content or User</h2>
              <p className="text-xs text-muted-foreground">
                Reporting <span className="font-semibold text-foreground">{reportedUserName}</span>
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Select Reason
            </label>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {REPORT_REASONS.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setSelectedReason(r.id)}
                  className={cn(
                    'p-2.5 rounded-xl border text-left transition cursor-pointer',
                    selectedReason === r.id
                      ? 'bg-rose-500/15 border-rose-500/40 text-foreground'
                      : 'bg-white/[0.02] border-white/[0.04] text-muted-foreground hover:bg-white/[0.04]'
                  )}
                >
                  <div className="text-xs font-semibold">{r.label}</div>
                  <div className="text-[10px] text-muted-foreground/80">{r.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Additional Details (Optional)
            </label>
            <textarea
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Provide extra context to help moderators review..."
              className="w-full text-xs p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-rose-500/50"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="text-xs bg-rose-600 hover:bg-rose-700"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              Submit Report
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
