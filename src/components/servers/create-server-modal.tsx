'use client';

import * as React from 'react';
import {
  Shield,
  Gamepad2,
  Users,
  Sparkles,
  Plus,
  LogIn,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface CreateServerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateServer: (
    name: string,
    description?: string,
    iconUrl?: string,
    template?: 'competitive' | 'hangout' | 'custom'
  ) => Promise<unknown>;
  onJoinServer?: (serverIdOrInvite: string) => Promise<{ success: boolean; error?: string }>;
}

export function CreateServerModal({
  open,
  onOpenChange,
  onCreateServer,
  onJoinServer,
}: CreateServerModalProps) {
  const { toast } = useToast();
  const [modalMode, setModalMode] = React.useState<'create' | 'join'>('create');
  const [selectedTemplate, setSelectedTemplate] = React.useState<'competitive' | 'hangout' | 'custom'>('competitive');
  const [serverName, setServerName] = React.useState('Squad Server');
  const [description, setDescription] = React.useState('Voice channels and chat for matches.');
  const [inviteInput, setInviteInput] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const templates = [
    {
      id: 'competitive' as const,
      title: 'Competitive & Scrims',
      desc: 'Optimized for tactical teams, callouts, and match coordination.',
      icon: Shield,
      defaultName: 'Apex Scrim Clan',
      defaultDesc: 'Official headquarters for ranked matches and tournament coordination.',
    },
    {
      id: 'hangout' as const,
      title: 'Friends & Community',
      desc: 'Relaxed hangout with casual voice lounges and general chat.',
      icon: Users,
      defaultName: 'The Hangout',
      defaultDesc: 'Casual community server for gaming sessions and chat.',
    },
    {
      id: 'custom' as const,
      title: 'Blank Canvas',
      desc: 'Create text and voice channels from scratch.',
      icon: Sparkles,
      defaultName: 'My Server',
      defaultDesc: '',
    },
  ];

  const handleSelectTemplate = (tmpl: typeof templates[0]) => {
    setSelectedTemplate(tmpl.id);
    setServerName(tmpl.defaultName);
    setDescription(tmpl.defaultDesc);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverName.trim()) return;

    setSubmitting(true);
    try {
      await onCreateServer(serverName.trim(), description.trim(), undefined, selectedTemplate);
      toast({
        title: 'Server created',
        description: `Welcome to "${serverName.trim()}". Invite members to join!`,
        type: 'success',
      });
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to create server.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = inviteInput.trim();
    if (!raw) return;

    let targetCode = raw;
    if (raw.includes('/invite/')) {
      targetCode = raw.split('/invite/')[1]?.split('?')[0] || raw;
    } else if (raw.includes('?join=')) {
      targetCode = raw.split('?join=')[1]?.split('&')[0] || raw;
    }

    setSubmitting(true);
    try {
      if (onJoinServer) {
        const res = await onJoinServer(targetCode);
        if (res.success) {
          toast({
            title: 'Joined server',
            description: 'You are now a member of this server.',
            type: 'success',
          });
          onOpenChange(false);
        } else {
          toast({
            title: 'Could not join server',
            description: res.error || 'Server not found with this code or link.',
            type: 'error',
          });
        }
      }
    } catch (err: any) {
      toast({
        title: 'Join failed',
        description: err?.message || 'Failed to join server.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-control bg-primary-subtle text-primary flex items-center justify-center shrink-0">
              <Gamepad2 className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle>Servers</DialogTitle>
              <DialogDescription>
                Create a server or join one with an invite link.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Mode Switcher Tabs */}
        <div className="flex p-0.5 rounded-control bg-surface-sidebar border border-border gap-1 my-2">
          <button
            type="button"
            onClick={() => setModalMode('create')}
            className={cn(
              'flex-1 py-1.5 rounded-control text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors',
              modalMode === 'create'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create server</span>
          </button>
          <button
            type="button"
            onClick={() => setModalMode('join')}
            className={cn(
              'flex-1 py-1.5 rounded-control text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors',
              modalMode === 'join'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Join server</span>
          </button>
        </div>

        {/* 1. CREATE SERVER MODE */}
        {modalMode === 'create' && (
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                Choose template
              </span>
              <div className="grid gap-2">
                {templates.map((tmpl) => {
                  const Icon = tmpl.icon;
                  const isSelected = selectedTemplate === tmpl.id;

                  return (
                    <button
                      type="button"
                      key={tmpl.id}
                      onClick={() => handleSelectTemplate(tmpl)}
                      className={cn(
                        'flex items-center justify-between p-2.5 rounded-card border text-left transition-colors cursor-pointer',
                        isSelected
                          ? 'border-primary bg-primary-subtle'
                          : 'border-border bg-card hover:bg-surface-hover'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={cn(
                            'w-7 h-7 rounded-control flex items-center justify-center shrink-0',
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-surface-hover text-muted-foreground'
                          )}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-foreground">
                            {tmpl.title}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {tmpl.desc}
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <Check className="w-4 h-4 text-primary shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 pt-1 border-t border-border">
              <div>
                <label htmlFor="create-server-name-input" className="text-xs font-medium text-foreground block mb-1">
                  Server name
                </label>
                <Input
                  id="create-server-name-input"
                  type="text"
                  required
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="e.g. My Server"
                />
              </div>

              <div>
                <label htmlFor="create-server-desc-input" className="text-xs font-medium text-foreground block mb-1">
                  Description
                </label>
                <Textarea
                  id="create-server-desc-input"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell people what your server is about..."
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={submitting}
                disabled={!serverName.trim() || submitting}
              >
                Create server
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* 2. JOIN SERVER MODE */}
        {modalMode === 'join' && (
          <form onSubmit={handleJoinSubmit} className="space-y-4">
            <div>
              <label htmlFor="join-invite-input" className="text-xs font-medium text-foreground block mb-1">
                Invite code or link
              </label>
              <Input
                id="join-invite-input"
                type="text"
                required
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                placeholder="e.g. https://nexus.app/invite/abc123xyz or code"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">
                Paste an invitation link or direct 8-character server code.
              </p>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={submitting}
                disabled={!inviteInput.trim() || submitting}
              >
                Join server
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
