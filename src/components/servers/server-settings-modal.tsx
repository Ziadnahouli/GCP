'use client';

import * as React from 'react';
import {
  Settings,
  Shield,
  Hash,
  Volume2,
  Trash2,
  X,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Server, Channel } from '@/lib/types/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface ServerSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: Server;
  onDeleteServer?: (serverId: string) => Promise<unknown>;
  onDeleteChannel?: (channelId: string) => Promise<unknown>;
}

export function ServerSettingsModal({
  open,
  onOpenChange,
  server,
  onDeleteServer,
  onDeleteChannel,
}: ServerSettingsModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<'overview' | 'channels' | 'roles' | 'danger'>('overview');
  const [serverName, setServerName] = React.useState(server.name);
  const [serverDesc, setServerDesc] = React.useState(server.description || '');

  if (!open) return null;

  const handleSaveOverview = () => {
    toast({
      title: 'Server Settings Saved',
      description: 'Server profile details updated successfully.',
      type: 'success',
    });
    onOpenChange(false);
  };

  const handleDeleteServerConfirm = async () => {
    if (confirm(`Are you sure you want to permanently delete "${server.name}"? This action cannot be undone.`)) {
      await onDeleteServer?.(server.id);
      toast({
        title: 'Server Deleted',
        description: `"${server.name}" was permanently removed.`,
        type: 'info',
      });
      onOpenChange(false);
    }
  };

  const navItems = [
    { id: 'overview' as const, label: 'Overview', icon: Settings },
    { id: 'channels' as const, label: 'Channels', icon: Hash },
    { id: 'roles' as const, label: 'Roles & Permissions', icon: Shield },
    { id: 'danger' as const, label: 'Danger Zone', icon: AlertTriangle, danger: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-md animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      <div className="relative w-full max-w-3xl rounded-2xl border border-border/80 bg-surface-default shadow-2xl overflow-hidden flex flex-col md:flex-row h-[560px] z-10 animate-in zoom-in-95 duration-150">
        {/* Left Settings Sidebar */}
        <div className="w-full md:w-56 bg-surface-sidebar border-b md:border-b-0 md:border-r border-border p-4 flex flex-col justify-between shrink-0 select-none">
          <div>
            <div className="px-2 py-1 mb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground truncate">
                {server.name}
              </h3>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all',
                      isActive
                        ? item.danger
                          ? 'bg-rose-500/15 text-rose-400 font-bold'
                          : 'bg-primary/15 text-primary font-bold'
                        : item.danger
                        ? 'text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-400'
                        : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="pt-2 border-t border-border/60 text-[10px] text-muted-foreground/60 font-mono">
            Server ID: {server.id}
          </div>
        </div>

        {/* Right Settings Content */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface-default">
          {/* Header */}
          <div className="h-14 border-b border-border/80 px-6 flex items-center justify-between shrink-0">
            <h4 className="text-sm font-bold text-foreground capitalize">
              {activeTab === 'overview' && 'Server Overview'}
              {activeTab === 'channels' && 'Manage Channels'}
              {activeTab === 'roles' && 'Roles & Clan Permissions'}
              {activeTab === 'danger' && 'Server Danger Zone'}
            </h4>
            <button
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-surface-hover"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeTab === 'overview' && (
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    Server Name
                  </label>
                  <input
                    type="text"
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-surface-sidebar text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={serverDesc}
                    onChange={(e) => setServerDesc(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-surface-sidebar text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>

                <div className="pt-2">
                  <Button size="sm" onClick={handleSaveOverview}>
                    Save Changes
                  </Button>
                </div>
              </div>
            )}

            {activeTab === 'channels' && (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  Manage the text and voice channels active on your server.
                </div>
                <div className="space-y-2">
                  {server.channels.map((chan) => (
                    <div
                      key={chan.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-surface-sidebar/50"
                    >
                      <div className="flex items-center gap-2.5">
                        {chan.type === 'text' ? (
                          <Hash className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <Volume2 className="w-4 h-4 text-emerald-400" />
                        )}
                        <div>
                          <div className="text-xs font-bold text-foreground">{chan.name}</div>
                          <div className="text-[10px] text-muted-foreground capitalize">
                            {chan.type} Channel
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 p-1.5"
                        onClick={() => onDeleteChannel?.(chan.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'roles' && (
              <div className="space-y-4">
                <div className="text-xs text-muted-foreground">
                  Configured hierarchy and permission levels for this squad server.
                </div>

                <div className="space-y-2.5">
                  {[
                    { role: 'Clan Leader (Owner)', desc: 'Full administrative access & ownership.', color: 'text-amber-400' },
                    { role: 'Officers (Admin)', desc: 'Manage channels, invite squadmates, mute unruly players.', color: 'text-primary' },
                    { role: 'Moderator', desc: 'Delete spam messages and enforce server rules.', color: 'text-cyan-400' },
                    { role: 'Squadmate (Member)', desc: 'Chat in text channels, connect to voice lounges.', color: 'text-muted-foreground' },
                  ].map((r, i) => (
                    <div key={i} className="p-3 rounded-xl border border-border/60 bg-surface-sidebar/50 flex items-center justify-between">
                      <div>
                        <div className={cn('text-xs font-bold', r.color)}>{r.role}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{r.desc}</div>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'danger' && (
              <div className="space-y-4 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10">
                <div className="flex items-center gap-2 text-rose-400 text-sm font-bold">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Delete Server</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Permanently delete this server, all associated text channels, voice rooms, and message history. This action cannot be reversed.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteServerConfirm}
                >
                  Delete &quot;{server.name}&quot;
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
