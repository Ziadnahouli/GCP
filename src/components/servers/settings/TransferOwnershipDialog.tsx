'use client';

import * as React from 'react';
import { Crown, Search, AlertTriangle, Check } from 'lucide-react';
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
import { Avatar } from '@/components/ui/avatar';
import { Server, ServerMember } from '@/lib/types/server';

interface TransferOwnershipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: Server;
  currentUserId?: string;
  onConfirm: (newOwnerId: string) => Promise<unknown>;
}

export function TransferOwnershipDialog({
  open,
  onOpenChange,
  server,
  currentUserId,
  onConfirm,
}: TransferOwnershipDialogProps) {
  const [search, setSearch] = React.useState<string>('');
  const [selectedMember, setSelectedMember] = React.useState<ServerMember | null>(null);
  const [acknowledged, setAcknowledged] = React.useState<boolean>(false);
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedMember(null);
      setAcknowledged(false);
      setSubmitting(false);
    }
  }, [open]);

  // Candidates exclude current user/owner
  const eligibleMembers = (server.members || []).filter(
    (m) => m.user_id !== currentUserId && m.user_id !== server.owner_id
  );

  const filteredMembers = eligibleMembers.filter((m) => {
    const name = m.profile?.display_name || m.profile?.username || '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const handleTransfer = async () => {
    if (!selectedMember || !acknowledged) return;
    setSubmitting(true);
    try {
      await onConfirm(selectedMember.user_id);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedName =
    selectedMember?.profile?.display_name ||
    selectedMember?.profile?.username ||
    'this member';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-500">
            <Crown className="w-5 h-5" />
            Transfer Server Ownership
          </DialogTitle>
          <DialogDescription>
            Select an active server member to transfer ownership of &quot;{server.name}&quot; to.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border border-border p-1">
            {filteredMembers.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No eligible members found.
              </div>
            ) : (
              filteredMembers.map((member) => {
                const name = member.profile?.display_name || member.profile?.username || 'Member';
                const isSelected = selectedMember?.user_id === member.user_id;

                return (
                  <button
                    key={member.user_id}
                    type="button"
                    onClick={() => setSelectedMember(member)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors text-xs ${
                      isSelected
                        ? 'bg-primary/10 border border-primary/30 text-foreground'
                        : 'hover:bg-accent/50 text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={member.profile?.avatar_url} name={name} size={24} />
                      <span className="truncate font-medium">{name}</span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {selectedMember && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="font-semibold">Important Loss of Ownership</span>
              </div>
              <p className="text-muted-foreground">
                You will lose primary ownership permissions over this server. You will be automatically reassigned
                to the <span className="font-semibold text-foreground">Admin</span> role, and {selectedName} will become the new owner.
              </p>
              <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-foreground font-medium">
                  I agree to transfer server ownership to {selectedName}
                </span>
              </label>
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
            onClick={handleTransfer}
            disabled={submitting || !selectedMember || !acknowledged}
          >
            {submitting ? 'Transferring...' : 'Transfer Ownership'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
