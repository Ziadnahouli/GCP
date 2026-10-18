'use client';

import * as React from 'react';
import {
  Users,
  UserPlus,
  Trash2,
  LogOut,
  Crown,
  Shield,
  Loader2,
  Check,
  Edit2,
  Save,
  Search,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { useAuth } from '@/features/auth/auth-provider';
import { useSocial } from '@/hooks/use-social';
import { useConversations } from '@/hooks/use-conversations';
import { Conversation } from '@/lib/types/messaging';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface GroupSettingsModalProps {
  conversation: Conversation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeftGroup?: () => void;
}

export function GroupSettingsModal({
  conversation,
  open,
  onOpenChange,
  onLeftGroup,
}: GroupSettingsModalProps) {
  const { user } = useAuth();
  const { friends } = useSocial();
  const {
    addGroupMembers,
    removeGroupMember,
    leaveGroup,
    updateGroupMetadata,
  } = useConversations();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = React.useState<'members' | 'add' | 'settings'>('members');
  const [groupName, setGroupName] = React.useState('');
  const [isSavingName, setIsSavingName] = React.useState(false);
  const [isLeaving, setIsLeaving] = React.useState(false);
  const [selectedFriendsToAdd, setSelectedFriendsToAdd] = React.useState<string[]>([]);
  const [isAdding, setIsAdding] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const membersList = React.useMemo(() => conversation?.members || [], [conversation?.members]);

  const currentMember = React.useMemo(() => {
    return membersList.find((m) => m.user_id === user?.id) || null;
  }, [membersList, user]);

  const isOwner = currentMember?.role === 'owner' || conversation?.created_by === user?.id;
  const isAdmin = isOwner || currentMember?.role === 'admin';

  React.useEffect(() => {
    if (conversation) {
      setGroupName(conversation.name || '');
      setSelectedFriendsToAdd([]);
      setSearchQuery('');
    }
  }, [conversation, open]);

  if (!conversation) return null;

  // Friends not currently in this group
  const existingMemberIds = new Set(membersList.map((m) => m.user_id));
  const candidateFriends = friends.filter((f) => !existingMemberIds.has(f.friend.id));

  const filteredCandidates = candidateFriends.filter(
    (f) =>
      !searchQuery.trim() ||
      f.friend.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.friend.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSaveName = async () => {
    if (!groupName.trim()) return;
    setIsSavingName(true);
    try {
      const { success, error } = await updateGroupMetadata(conversation.id, {
        name: groupName.trim(),
      });
      if (!success) throw new Error(error || 'Failed to update name');
      toast({ title: 'Squad Name Updated', description: 'Saved successfully.', type: 'success' });
    } catch (err: any) {
      toast({ title: 'Update Failed', description: err?.message, type: 'error' });
    } finally {
      setIsSavingName(false);
    }
  };

  const handleAddMembers = async () => {
    if (selectedFriendsToAdd.length === 0) return;
    setIsAdding(true);
    try {
      const { success, error } = await addGroupMembers(conversation.id, selectedFriendsToAdd);
      if (!success) throw new Error(error || 'Failed to add members');
      toast({
        title: 'Squadmates Enlisted',
        description: `Added ${selectedFriendsToAdd.length} new member(s).`,
        type: 'success',
      });
      setSelectedFriendsToAdd([]);
      setActiveTab('members');
    } catch (err: any) {
      toast({ title: 'Add Failed', description: err?.message, type: 'error' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveMember = async (memberUserId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from this squad?`)) return;
    try {
      const { success, error } = await removeGroupMember(conversation.id, memberUserId);
      if (!success) throw new Error(error || 'Failed to remove member');
      toast({ title: 'Member Removed', description: `${memberName} was removed.`, type: 'info' });
    } catch (err: any) {
      toast({ title: 'Remove Failed', description: err?.message, type: 'error' });
    }
  };

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave this squad group?')) return;
    setIsLeaving(true);
    try {
      const { success, error } = await leaveGroup(conversation.id);
      if (!success) throw new Error(error || 'Failed to leave squad');
      toast({ title: 'Left Squad', description: 'You have left the squad group.', type: 'info' });
      onOpenChange(false);
      onLeftGroup?.();
    } catch (err: any) {
      toast({ title: 'Action Failed', description: err?.message, type: 'error' });
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg w-full p-6 border border-white/[0.08] bg-[#0c0d14] text-foreground rounded-2xl shadow-2xl"
        onClose={() => onOpenChange(false)}
      >
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground truncate max-w-[240px]">
                  {conversation.name || 'Squad Group'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {membersList.length} Squad Member{membersList.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06]">
              <button
                onClick={() => setActiveTab('members')}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-lg transition font-medium',
                  activeTab === 'members'
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Members
              </button>
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('add')}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-lg transition font-medium flex items-center gap-1',
                    activeTab === 'add'
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Invite</span>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('settings')}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-lg transition font-medium',
                    activeTab === 'settings'
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Config
                </button>
              )}
            </div>
          </div>

          {/* TAB 1: MEMBERS */}
          {activeTab === 'members' && (
            <div className="space-y-3">
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 select-none">
                {membersList.map((member) => {
                  const isCurrent = member.user_id === user?.id;
                  const role = member.role || (member.user_id === conversation.created_by ? 'owner' : 'member');
                  const canKick = isAdmin && !isCurrent && role !== 'owner';

                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar
                          src={member.profile?.avatar_url}
                          name={member.profile?.display_name || 'Member'}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5 truncate">
                            <span>{member.profile?.display_name || 'Squad Member'}</span>
                            {isCurrent && (
                              <span className="text-[10px] text-primary font-normal">(You)</span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            @{member.profile?.username || 'user'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {role === 'owner' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <Crown className="w-3 h-3" />
                            Owner
                          </span>
                        )}
                        {role === 'admin' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/30">
                            <Shield className="w-3 h-3" />
                            Admin
                          </span>
                        )}

                        {canKick && (
                          <button
                            onClick={() =>
                              handleRemoveMember(
                                member.user_id,
                                member.profile?.display_name || 'member'
                              )
                            }
                            className="p-1 rounded-lg text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            title="Remove from squad"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Leave squad button */}
              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleLeave}
                  disabled={isLeaving}
                  className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                >
                  {isLeaving ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <LogOut className="w-3 h-3 mr-1.5" />}
                  Leave Squad
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="text-xs border-white/10"
                >
                  Close
                </Button>
              </div>
            </div>
          )}

          {/* TAB 2: INVITE / ADD */}
          {activeTab === 'add' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter friends..."
                  className="text-xs pl-8 bg-white/[0.03] border-white/10 h-8"
                />
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1 pr-1 select-none">
                {filteredCandidates.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    All friends are already members of this squad!
                  </div>
                ) : (
                  filteredCandidates.map((f) => {
                    const isSelected = selectedFriendsToAdd.includes(f.friend.id);
                    return (
                      <div
                        key={f.friend.id}
                        onClick={() =>
                          setSelectedFriendsToAdd((prev) =>
                            prev.includes(f.friend.id)
                              ? prev.filter((id) => id !== f.friend.id)
                              : [...prev, f.friend.id]
                          )
                        }
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

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setActiveTab('members')}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddMembers}
                  disabled={selectedFriendsToAdd.length === 0 || isAdding}
                  className="text-xs"
                >
                  {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                  Enlist Selected ({selectedFriendsToAdd.length})
                </Button>
              </div>
            </div>
          )}

          {/* TAB 3: CONFIG */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Squad Display Name
                </label>
                <div className="flex gap-2">
                  <Input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Squad Name"
                    className="text-xs bg-white/[0.03] border-white/10"
                    maxLength={40}
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveName}
                    disabled={isSavingName || !groupName.trim() || groupName === conversation.name}
                    className="text-xs shrink-0"
                  >
                    {isSavingName ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                    Save
                  </Button>
                </div>
              </div>

              <div className="pt-2 border-t border-white/[0.06] flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="text-xs border-white/10"
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
