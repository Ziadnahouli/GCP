'use client';

import * as React from 'react';
import { Users, Search, Check, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { useSocial } from '@/hooks/use-social';
import { useConversations } from '@/hooks/use-conversations';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface CreateGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupCreated?: (conversationId: string) => void;
}

export function CreateGroupModal({ open, onOpenChange, onGroupCreated }: CreateGroupModalProps) {
  const { friends } = useSocial();
  const { createGroupConversation } = useConversations();
  const { toast } = useToast();

  const [groupName, setGroupName] = React.useState('');
  const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setGroupName('');
      setSelectedUserIds([]);
      setSearchQuery('');
      setIsSubmitting(false);
    }
  }, [open]);

  const filteredFriends = React.useMemo(() => {
    if (!searchQuery.trim()) return friends;
    const query = searchQuery.toLowerCase();
    return friends.filter(
      (f) =>
        f.friend.display_name.toLowerCase().includes(query) ||
        f.friend.username.toLowerCase().includes(query)
    );
  }, [friends, searchQuery]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (selectedUserIds.length === 0) {
      toast({
        title: 'Squad Selection Empty',
        description: 'Please select at least 1 friend to form a squad group.',
        type: 'error',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const name = groupName.trim() || 'Tactical Squad';
      const { conversationId, error } = await createGroupConversation(name, selectedUserIds);

      if (error || !conversationId) {
        throw new Error(error || 'Failed to create group');
      }

      toast({
        title: 'Squad Group Formed',
        description: `"${name}" with ${selectedUserIds.length + 1} members is ready.`,
        type: 'success',
      });

      onOpenChange(false);
      onGroupCreated?.(conversationId);
    } catch (err: any) {
      toast({
        title: 'Group Creation Failed',
        description: err?.message || 'Could not create squad conversation.',
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
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Create Squad Group DM</h2>
              <p className="text-xs text-muted-foreground">
                Group up with up to 10 friends for tactical comms.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Group Name (Optional)
            </label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Valorant Ranked Squad"
              className="text-xs bg-white/[0.03] border-white/10"
              maxLength={40}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Select Squadmates ({selectedUserIds.length} selected)
              </label>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search friends by name or handle..."
                className="text-xs pl-8 bg-white/[0.03] border-white/10 h-8"
              />
            </div>

            <div className="max-h-52 overflow-y-auto space-y-1 pr-1 select-none">
              {filteredFriends.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  {friends.length === 0 ? 'No friends added yet.' : 'No friends match search.'}
                </div>
              ) : (
                filteredFriends.map((f) => {
                  const isSelected = selectedUserIds.includes(f.friend.id);
                  return (
                    <div
                      key={f.friend.id}
                      onClick={() => toggleUser(f.friend.id)}
                      className={cn(
                        'flex items-center justify-between p-2 rounded-xl transition cursor-pointer border',
                        isSelected
                          ? 'bg-primary/15 border-primary/40 text-foreground'
                          : 'bg-white/[0.02] border-white/[0.04] text-muted-foreground hover:bg-white/[0.04]'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar
                          src={f.friend.avatar_url}
                          name={f.friend.display_name}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-foreground truncate">
                            {f.friend.display_name}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            @{f.friend.username}
                          </div>
                        </div>
                      </div>

                      <div
                        className={cn(
                          'w-5 h-5 rounded-md border flex items-center justify-center transition-colors',
                          isSelected
                            ? 'bg-primary border-primary text-black'
                            : 'border-white/20 bg-transparent'
                        )}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
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
              onClick={handleCreate}
              disabled={selectedUserIds.length === 0 || isSubmitting}
              className="text-xs"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              Create Squad Group
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
