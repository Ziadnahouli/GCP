'use client';

import * as React from 'react';
import {
  Hash,
  Volume2,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Channel, ChannelType, Server } from '@/lib/types/server';
import { DeleteChannelDialog } from './DeleteChannelDialog';
import { ChannelPermissionsDialog } from './ChannelPermissionsDialog';
import { useServers } from '@/hooks/use-servers';
import { ToastItem } from '@/components/ui/toast';

interface ChannelsTabProps {
  server: Server;
  canManageChannels: boolean;
  toast: (options: Omit<ToastItem, 'id'>) => void;
  onCreateChannel?: (serverId: string, name: string, type: ChannelType, topic?: string) => Promise<unknown>;
  onUpdateChannel?: (serverId: string, channelId: string, updates: { name?: string; topic?: string | null }) => Promise<unknown>;
  onDeleteChannel?: (serverId: string, channelId: string) => Promise<unknown>;
}

export function ChannelsTab({
  server,
  canManageChannels,
  toast,
  onCreateChannel,
  onUpdateChannel,
  onDeleteChannel,
}: ChannelsTabProps) {
  const { reorderChannels } = useServers();

  // Create channel state
  const [showCreate, setShowCreate] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newType, setNewType] = React.useState<ChannelType>('text');
  const [newTopic, setNewTopic] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  // Edit channel state
  const [editingChannel, setEditingChannel] = React.useState<Channel | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editTopic, setEditTopic] = React.useState('');
  const [updating, setUpdating] = React.useState(false);

  // Delete channel state
  const [deletingChannel, setDeletingChannel] = React.useState<Channel | null>(null);

  // Channel permissions state
  const [permissionsChannel, setPermissionsChannel] = React.useState<Channel | null>(null);

  // Reorder loading state
  const [reordering, setReordering] = React.useState(false);

  const channels = server.channels || [];
  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  const normalizeChannelName = (val: string, type: ChannelType) => {
    if (type === 'text') {
      return val
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 50);
    }
    return val.slice(0, 50);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = normalizeChannelName(newName.trim(), newType);
    if (!finalName) {
      toast({
        title: 'Invalid Channel Name',
        description: 'Please provide a valid channel name (1-50 characters).',
        type: 'error',
      });
      return;
    }

    setCreating(true);
    try {
      if (onCreateChannel) {
        await onCreateChannel(server.id, finalName, newType, newTopic.trim() || undefined);
      }
      setShowCreate(false);
      setNewName('');
      setNewTopic('');
      toast({
        title: 'Channel Created',
        description: `${newType === 'text' ? '#' : '🔊 '} ${finalName} created successfully.`,
        type: 'success',
      });
    } catch {
      toast({
        title: 'Creation Failed',
        description: 'Failed to create channel. Check permissions and name uniqueness.',
        type: 'error',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleStartEdit = (channel: Channel) => {
    setEditingChannel(channel);
    setEditName(channel.name);
    setEditTopic(channel.topic || '');
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChannel) return;
    const finalName = normalizeChannelName(editName.trim(), editingChannel.type);
    if (!finalName) {
      toast({
        title: 'Invalid Channel Name',
        description: 'Channel name cannot be empty.',
        type: 'error',
      });
      return;
    }

    setUpdating(true);
    try {
      if (onUpdateChannel) {
        await onUpdateChannel(server.id, editingChannel.id, {
          name: finalName,
          topic: editTopic.trim() || null,
        });
      }
      setEditingChannel(null);
      toast({
        title: 'Channel Updated',
        description: 'Channel changes saved successfully.',
        type: 'success',
      });
    } catch {
      toast({
        title: 'Update Failed',
        description: 'Failed to update channel.',
        type: 'error',
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingChannel) return;
    try {
      if (onDeleteChannel) {
        await onDeleteChannel(server.id, deletingChannel.id);
      }
      toast({
        title: 'Channel Deleted',
        description: `${deletingChannel.type === 'text' ? '#' : '🔊 '} ${deletingChannel.name} was removed.`,
        type: 'success',
      });
    } catch (err: unknown) {
      toast({
        title: 'Deletion Failed',
        description: (err as Error)?.message || 'Failed to delete channel.',
        type: 'error',
      });
    }
  };

  const handleMoveChannel = async (channelId: string, direction: 'up' | 'down') => {
    const idx = channels.findIndex((c) => c.id === channelId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === channels.length - 1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const newOrder = [...channels];
    const [moved] = newOrder.splice(idx, 1);
    newOrder.splice(targetIdx, 0, moved);

    setReordering(true);
    try {
      await reorderChannels(
        server.id,
        newOrder.map((c) => c.id)
      );
    } catch {
      toast({
        title: 'Reorder Failed',
        description: 'Could not update channel order.',
        type: 'error',
      });
    } finally {
      setReordering(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Channels</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Organize communication channels and control voice and text zones.
          </p>
        </div>
        {canManageChannels && !showCreate && (
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="text-xs gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Channel
          </Button>
        )}
      </div>

      {/* Create Channel Inline Panel */}
      {showCreate && (
        <form
          onSubmit={handleCreateSubmit}
          className="p-4 rounded-xl border border-border bg-card/60 space-y-4 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              New Channel
            </h4>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={newType === 'text' ? 'default' : 'secondary'}
                size="sm"
                onClick={() => setNewType('text')}
                className="text-xs h-7 gap-1"
              >
                <Hash className="w-3 h-3" /> Text
              </Button>
              <Button
                type="button"
                variant={newType === 'voice' ? 'default' : 'secondary'}
                size="sm"
                onClick={() => setNewType('voice')}
                className="text-xs h-7 gap-1"
              >
                <Volume2 className="w-3 h-3" /> Voice
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Channel Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={newType === 'text' ? 'e.g. strategy' : 'e.g. Squad Voice'}
              maxLength={50}
              required
              className="text-xs"
              autoFocus
            />
            {newType === 'text' && (
              <p className="text-xs text-muted-foreground">
                Text channel names will be lowercased and spaces replaced with dashes.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Topic (Optional)
            </label>
            <Input
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder="What is this channel for?"
              maxLength={1024}
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={creating}
              onClick={() => {
                setShowCreate(false);
                setNewName('');
                setNewTopic('');
              }}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={creating} className="text-xs">
              {creating ? 'Creating...' : 'Create Channel'}
            </Button>
          </div>
        </form>
      )}

      {/* Edit Channel Inline Panel */}
      {editingChannel && (
        <form
          onSubmit={handleUpdateSubmit}
          className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-4 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Edit2 className="w-3.5 h-3.5" />
              Edit {editingChannel.type === 'text' ? '#' : '🔊 '} {editingChannel.name}
            </h4>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Channel Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={50}
              required
              className="text-xs"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Topic (Optional)
            </label>
            <Textarea
              value={editTopic}
              onChange={(e) => setEditTopic(e.target.value)}
              maxLength={1024}
              rows={2}
              className="resize-none text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={updating}
              onClick={() => setEditingChannel(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={updating} className="text-xs">
              {updating ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      )}

      {/* Channel Lists */}
      <div className="space-y-4">
        {/* Text Channels */}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Text Channels ({textChannels.length})
          </div>
          <div className="space-y-1">
            {textChannels.map((channel, idx) => {
              const globalIdx = channels.findIndex((c) => c.id === channel.id);
              const isFirst = globalIdx === 0;
              const isLast = globalIdx === channels.length - 1;
              const isLastText = textChannels.length <= 1;

              return (
                <div
                  key={channel.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card/40 hover:bg-card/70 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Hash className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-foreground truncate block">
                        {channel.name}
                      </span>
                      {channel.topic && (
                        <span className="text-xs text-muted-foreground truncate block">
                          {channel.topic}
                        </span>
                      )}
                    </div>
                  </div>

                  {canManageChannels && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isFirst || reordering}
                        onClick={() => handleMoveChannel(channel.id, 'up')}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isLast || reordering}
                        onClick={() => handleMoveChannel(channel.id, 'down')}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setPermissionsChannel(channel)}
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        title="Channel Permissions"
                      >
                        <Shield className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStartEdit(channel)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Edit Channel"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletingChannel(channel)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title={isLastText ? 'Cannot delete last text channel' : 'Delete Channel'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Voice Channels */}
        <div className="space-y-1.5 pt-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Voice Channels ({voiceChannels.length})
          </div>
          <div className="space-y-1">
            {voiceChannels.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">
                No voice channels configured.
              </div>
            ) : (
              voiceChannels.map((channel) => {
                const globalIdx = channels.findIndex((c) => c.id === channel.id);
                const isFirst = globalIdx === 0;
                const isLast = globalIdx === channels.length - 1;

                return (
                  <div
                    key={channel.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card/40 hover:bg-card/70 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Volume2 className="w-4 h-4 text-success shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-foreground truncate block">
                          {channel.name}
                        </span>
                        {channel.topic && (
                          <span className="text-xs text-muted-foreground truncate block">
                            {channel.topic}
                          </span>
                        )}
                      </div>
                    </div>

                    {canManageChannels && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={isFirst || reordering}
                          onClick={() => handleMoveChannel(channel.id, 'up')}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={isLast || reordering}
                          onClick={() => handleMoveChannel(channel.id, 'down')}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setPermissionsChannel(channel)}
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          title="Channel Permissions"
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStartEdit(channel)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Edit Channel"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingChannel(channel)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Delete Channel"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Delete Channel Radix Dialog */}
      <DeleteChannelDialog
        open={Boolean(deletingChannel)}
        onOpenChange={(open) => !open && setDeletingChannel(null)}
        channel={deletingChannel}
        isLastTextChannel={
          deletingChannel?.type === 'text' && textChannels.length <= 1
        }
        onConfirm={handleDeleteConfirm}
      />

      {/* Channel Permissions Radix Dialog */}
      <ChannelPermissionsDialog
        open={Boolean(permissionsChannel)}
        onOpenChange={(open) => !open && setPermissionsChannel(null)}
        channel={permissionsChannel}
        server={server}
        toast={toast}
      />
    </div>
  );
}
