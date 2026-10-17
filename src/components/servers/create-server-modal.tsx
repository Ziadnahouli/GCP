'use client';

import * as React from 'react';
import {
  Shield,
  Gamepad2,
  Users,
  Sparkles,
  X,
  Plus,
  Radio,
  Check,
  Compass,
  Link,
  LogIn,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useModalEscape } from '@/hooks/use-modal-escape';
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
  useModalEscape(open, onOpenChange);
  const { toast } = useToast();
  const [modalMode, setModalMode] = React.useState<'create' | 'join'>('create');
  const [selectedTemplate, setSelectedTemplate] = React.useState<'competitive' | 'hangout' | 'custom'>('competitive');
  const [serverName, setServerName] = React.useState('Tactical Squad Bravo');
  const [description, setDescription] = React.useState('Competitive squad for ranked grinds and tactical comms.');
  const [inviteInput, setInviteInput] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  if (!open) return null;

  const templates = [
    {
      id: 'competitive' as const,
      title: 'Gaming & Competitive Scrims',
      desc: 'Optimized for tactical FPS squads, map callouts & scrim comms.',
      icon: Shield,
      defaultName: 'Apex Scrim Clan',
      defaultDesc: 'Official headquarters for ranked scrims, strats, and tournament matches.',
    },
    {
      id: 'hangout' as const,
      title: 'Squad Hangout & Friends',
      desc: 'Relaxed hangout with casual voice lounges and gaming banter.',
      icon: Users,
      defaultName: 'The Gamer Den',
      defaultDesc: 'Casual squad lounge for weekend gaming sessions and memes.',
    },
    {
      id: 'custom' as const,
      title: 'Create My Own',
      desc: 'Customize channels and roles from a blank canvas.',
      icon: Sparkles,
      defaultName: 'My Clan',
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
        title: 'Server Created!',
        description: `Welcome to "${serverName.trim()}". Invite your squadmates to join!`,
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
    if (!inviteInput.trim()) return;

    setSubmitting(true);
    try {
      if (onJoinServer) {
        const res = await onJoinServer(inviteInput.trim());
        if (res.success) {
          toast({
            title: 'Joined Server!',
            description: 'You are now a member of the squad.',
            type: 'success',
          });
          onOpenChange(false);
        } else {
          toast({
            title: 'Could Not Join Server',
            description: res.error || 'Server not found with this ID or link.',
            type: 'error',
          });
        }
      }
    } catch (err: any) {
      toast({
        title: 'Join Failed',
        description: err?.message || 'Failed to join server.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-md animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg rounded-2xl border border-white/[0.08] bg-surface-panel p-4 sm:p-6 shadow-2xl shadow-black/90 z-10 animate-in zoom-in-95 duration-150 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center text-primary">
              <Gamepad2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Gaming Communities</h3>
              <p className="text-xs text-muted-foreground/70">
                Create a squad server or join your friends.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close dialog"
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-white/[0.04] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] gap-1">
          <button
            type="button"
            onClick={() => setModalMode('create')}
            className={cn(
              'flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors',
              modalMode === 'create'
                ? 'bg-primary text-primary-foreground shadow-subtle'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Server</span>
          </button>
          <button
            type="button"
            onClick={() => setModalMode('join')}
            className={cn(
              'flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors',
              modalMode === 'join'
                ? 'bg-primary text-primary-foreground shadow-subtle'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Join with Invite</span>
          </button>
        </div>

        {/* 1. CREATE SERVER MODE */}
        {modalMode === 'create' && (
          <div className="space-y-4">
            {/* Template Selectors */}
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Start from a Squad Template
              </div>
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
                        'w-full text-left flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer',
                        isSelected
                          ? 'border-primary/50 bg-primary/10'
                          : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-8 h-8 rounded-md flex items-center justify-center shrink-0',
                            isSelected ? 'bg-primary text-primary-foreground' : 'bg-white/[0.04] text-muted-foreground'
                          )}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-foreground">{tmpl.title}</div>
                          <div className="text-[11px] text-muted-foreground/60 leading-tight">{tmpl.desc}</div>
                        </div>
                      </div>

                      {isSelected && <Check className="w-4 h-4 text-primary shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form Inputs */}
            <form onSubmit={handleCreateSubmit} className="space-y-3 pt-1">
              <div>
                <label htmlFor="create-server-name" className="text-xs font-medium text-foreground block mb-1">
                  Server Name
                </label>
                <input
                  id="create-server-name"
                  type="text"
                  required
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="e.g. Tactical Squad Alpha"
                  className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-foreground text-xs focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="create-server-desc" className="text-xs font-medium text-foreground block mb-1">
                  Description
                </label>
                <input
                  id="create-server-desc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional clan bio or server topic"
                  className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-foreground text-xs focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting || !serverName.trim()}
                  className="text-xs font-medium"
                >
                  {submitting ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </span>
                  ) : (
                    'Create Squad Server'
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* 2. JOIN SERVER MODE */}
        {modalMode === 'join' && (
          <form onSubmit={handleJoinSubmit} className="space-y-4 pt-1">
            <div className="space-y-2">
              <label htmlFor="join-server-input" className="text-xs font-medium text-foreground block">
                Server ID or Invite Link
              </label>
              <div className="relative">
                <Link className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground/60" />
                <input
                  id="join-server-input"
                  type="text"
                  required
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  placeholder="e.g. 00000000-0000-... or https://nexus.gg/join/..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-foreground text-xs focus:outline-none focus:border-primary/50 transition-colors font-mono"
                />
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                Ask a clan leader or friend for their server ID or invite link to join directly.
              </p>
            </div>

            <div className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-2">
              <div className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-primary" />
                <span>Featured Communities</span>
              </div>
              <div className="space-y-1">
                <div
                  onClick={() => setInviteInput('00000000-0000-0000-0000-000000000001')}
                  className="text-xs p-2 rounded-lg bg-surface-default hover:bg-surface-hover border border-white/[0.06] cursor-pointer flex items-center justify-between"
                >
                  <span className="font-medium text-foreground">Tactical Squad Alpha</span>
                  <span className="text-[10px] text-primary font-mono">Use ID</span>
                </div>
                <div
                  onClick={() => setInviteInput('00000000-0000-0000-0000-000000000002')}
                  className="text-xs p-2 rounded-lg bg-surface-default hover:bg-surface-hover border border-white/[0.06] cursor-pointer flex items-center justify-between"
                >
                  <span className="font-medium text-foreground">Cyber Ranked Grinders</span>
                  <span className="text-[10px] text-primary font-mono">Use ID</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || !inviteInput.trim()}
                className="text-xs font-medium gap-1.5"
              >
                {submitting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Joining...</span>
                  </span>
                ) : (
                  <>
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Join Server</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
