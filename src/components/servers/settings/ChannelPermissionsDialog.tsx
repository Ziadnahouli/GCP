'use client';

import * as React from 'react';
import { Shield, Check, X, Minus, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Channel, Server, ServerPermission, RoleDefinition } from '@/lib/types/server';
import { ToastItem } from '@/components/ui/toast';
import { useServers } from '@/hooks/use-servers';

interface ChannelPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: Channel | null;
  server: Server;
  toast: (options: Omit<ToastItem, 'id'>) => void;
}

interface PermOption {
  id: ServerPermission;
  label: string;
  description: string;
}

const TEXT_PERMISSIONS: PermOption[] = [
  {
    id: 'send_messages',
    label: 'Send Messages',
    description: 'Allow or prevent members with this role from sending text messages in this channel.',
  },
  {
    id: 'send_attachments',
    label: 'Attach Files & Media',
    description: 'Allow or prevent uploading screenshots, documents, and recordings.',
  },
  {
    id: 'mention_everyone',
    label: 'Mention @everyone',
    description: 'Allow or prevent notifying all server members via @everyone and @here.',
  },
];

const VOICE_PERMISSIONS: PermOption[] = [
  {
    id: 'connect_voice',
    label: 'Connect to Channel',
    description: 'Allow or prevent members with this role from joining this voice lounge.',
  },
  {
    id: 'speak_voice',
    label: 'Speak in Channel',
    description: 'Allow or prevent members from unmuting their microphone and speaking.',
  },
  {
    id: 'share_screen',
    label: 'Share Screen & Camera',
    description: 'Allow or prevent streaming gameplay screens or video feeds.',
  },
];

type OverrideState = 'allow' | 'inherit' | 'deny';

export function ChannelPermissionsDialog({
  open,
  onOpenChange,
  channel,
  server,
  toast,
}: ChannelPermissionsDialogProps) {
  const { setChannelPermissionOverride } = useServers();

  const roles = React.useMemo<RoleDefinition[]>(() => {
    if (server.roles && server.roles.length > 0) {
      return server.roles;
    }
    return [
      { id: `${server.id}-admin`, name: 'Admin', permissions: [] },
      { id: `${server.id}-moderator`, name: 'Moderator', permissions: [] },
      { id: `${server.id}-member`, name: 'Member', permissions: [] },
    ];
  }, [server.roles, server.id]);

  const [selectedRoleId, setSelectedRoleId] = React.useState<string>('');
  const [permStates, setPermStates] = React.useState<Record<ServerPermission, OverrideState>>({} as Record<ServerPermission, OverrideState>);
  const [saving, setSaving] = React.useState(false);

  const relevantPermissions = channel?.type === 'voice' ? VOICE_PERMISSIONS : TEXT_PERMISSIONS;

  // Initialize selected role and permission states when channel opens or changes
  React.useEffect(() => {
    if (open && roles.length > 0) {
      const initialRole = roles[0]?.id || '';
      setSelectedRoleId(initialRole);
    }
  }, [open, roles]);

  // Sync state when role changes or channel overrides change
  React.useEffect(() => {
    if (!channel || !selectedRoleId) return;

    const override = (channel.permission_overrides || []).find((o) => o.role_id === selectedRoleId);
    const nextStates: Record<string, OverrideState> = {};

    for (const opt of relevantPermissions) {
      if (override?.deny?.includes(opt.id)) {
        nextStates[opt.id] = 'deny';
      } else if (override?.allow?.includes(opt.id)) {
        nextStates[opt.id] = 'allow';
      } else {
        nextStates[opt.id] = 'inherit';
      }
    }

    setPermStates(nextStates as Record<ServerPermission, OverrideState>);
  }, [channel, selectedRoleId, relevantPermissions]);

  const handleStateChange = (permission: ServerPermission, newState: OverrideState) => {
    setPermStates((prev) => ({
      ...prev,
      [permission]: newState,
    }));
  };

  const handleSave = async () => {
    if (!channel || !selectedRoleId) return;
    setSaving(true);
    try {
      const allow: ServerPermission[] = [];
      const deny: ServerPermission[] = [];

      for (const [perm, state] of Object.entries(permStates)) {
        const p = perm as ServerPermission;
        if (state === 'allow') allow.push(p);
        if (state === 'deny') deny.push(p);
      }

      const res = await setChannelPermissionOverride(
        server.id,
        channel.id,
        selectedRoleId,
        allow,
        deny
      );

      if (res.ok) {
        toast({
          title: 'Overrides Updated',
          description: `Channel permissions saved for ${roles.find((r) => r.id === selectedRoleId)?.name || 'Role'}.`,
          type: 'success',
        });
      } else {
        toast({
          title: 'Update Failed',
          description: res.error || 'Failed to save channel permission overrides.',
          type: 'error',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while saving overrides.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!channel) return null;

  const channelPrefix = channel.type === 'text' ? '#' : '🔊 ';
  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Shield className="w-5 h-5 text-primary" />
            Channel Permissions: {channelPrefix}{channel.name}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Configure channel-specific overrides for each role. Overrides take precedence over default server role permissions.
          </DialogDescription>
        </DialogHeader>

        {/* Role Tabs */}
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Select Role
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 rounded-lg border border-border bg-card/50">
              {roles.map((r) => {
                const isSelected = r.id === selectedRoleId;
                const hasOverride = (channel.permission_overrides || []).some((o) => o.role_id === r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRoleId(r.id)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: r.color || 'var(--primary)' }}
                    />
                    <span className="truncate max-w-[120px]">{r.name}</span>
                    {hasOverride && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary ring-1 ring-background shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Permissions List */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-foreground">
                Permissions for {selectedRole?.name || 'Selected Role'}
              </span>
              <span className="text-xs text-muted-foreground">
                Allow / Inherit / Deny
              </span>
            </div>

            <div className="space-y-2">
              {relevantPermissions.map((opt) => {
                const currentState = permStates[opt.id] || 'inherit';

                return (
                  <div
                    key={opt.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/60 hover:bg-card/90 transition-colors"
                  >
                    <div className="space-y-0.5 pr-4 min-w-0">
                      <div className="text-xs font-medium text-foreground">
                        {opt.label}
                      </div>
                      <div className="text-xs text-muted-foreground leading-relaxed">
                        {opt.description}
                      </div>
                    </div>

                    {/* 3-State Toggle Segment */}
                    <div className="flex items-center gap-1 shrink-0 p-1 bg-muted/60 rounded-lg border border-border">
                      {/* Deny Button */}
                      <button
                        type="button"
                        onClick={() => handleStateChange(opt.id, 'deny')}
                        title="Deny Permission"
                        aria-label={`Deny ${opt.label}`}
                        className={`p-1.5 rounded-md text-xs transition-colors ${
                          currentState === 'deny'
                            ? 'bg-destructive text-destructive-foreground shadow-xs font-bold'
                            : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'
                        }`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>

                      {/* Inherit Button */}
                      <button
                        type="button"
                        onClick={() => handleStateChange(opt.id, 'inherit')}
                        title="Inherit Role Default"
                        aria-label={`Inherit ${opt.label}`}
                        className={`p-1.5 rounded-md text-xs transition-colors ${
                          currentState === 'inherit'
                            ? 'bg-secondary text-secondary-foreground shadow-xs font-bold'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>

                      {/* Allow Button */}
                      <button
                        type="button"
                        onClick={() => handleStateChange(opt.id, 'allow')}
                        title="Allow Permission"
                        aria-label={`Allow ${opt.label}`}
                        className={`p-1.5 rounded-md text-xs transition-colors ${
                          currentState === 'allow'
                            ? 'bg-primary text-primary-foreground shadow-xs font-bold'
                            : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="text-xs"
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !selectedRoleId}
            className="text-xs gap-1.5"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Overrides'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

