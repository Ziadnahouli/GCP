'use client';

import * as React from 'react';
import { Save, Upload, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar } from '@/components/ui/avatar';
import { Server } from '@/lib/types/server';
import { getBrowserClient } from '@/lib/supabase/client';
import { validateFile } from '@/lib/storage/upload';
import { useAuth } from '@/features/auth/auth-provider';
import { ToastItem } from '@/components/ui/toast';

interface OverviewTabProps {
  server: Server;
  onUpdateServer?: (
    serverId: string,
    updates: { name?: string; description?: string | null; icon_url?: string | null }
  ) => Promise<unknown>;
  canManageServer: boolean;
  toast: (options: Omit<ToastItem, 'id'>) => void;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
}

export function OverviewTab({
  server,
  onUpdateServer,
  canManageServer,
  toast,
  isDirty,
  setIsDirty,
}: OverviewTabProps) {
  const { user } = useAuth();
  const [name, setName] = React.useState(server.name);
  const [description, setDescription] = React.useState(server.description || '');
  const [iconUrl, setIconUrl] = React.useState(server.icon_url || '');
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // SS-O2: Only sync if server ID changes or form is not dirty
  const lastServerIdRef = React.useRef(server.id);
  React.useEffect(() => {
    if (server.id !== lastServerIdRef.current) {
      lastServerIdRef.current = server.id;
      setName(server.name);
      setDescription(server.description || '');
      setIconUrl(server.icon_url || '');
      setIsDirty(false);
    } else if (!isDirty) {
      setName(server.name);
      setDescription(server.description || '');
      setIconUrl(server.icon_url || '');
    }
  }, [server, isDirty, setIsDirty]);

  const handleNameChange = (val: string) => {
    setName(val);
    setIsDirty(true);
  };

  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    setIsDirty(true);
  };

  const handleIconUrlChange = (val: string) => {
    setIconUrl(val);
    setIsDirty(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: 'Server icon must be 2MB or smaller.',
        type: 'error',
      });
      return;
    }

    const validation = validateFile(file);
    if (!validation.valid) {
      toast({
        title: 'Invalid File',
        description: validation.error || 'Please upload a valid JPEG, PNG, or WebP image.',
        type: 'error',
      });
      return;
    }

    setUploading(true);
    try {
      const supabase = getBrowserClient();
      const ext = file.name.split('.').pop() || 'png';
      const userPrefix = user?.id || 'server-icons';
      const filePath = `${userPrefix}/server-icons/${server.id}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setIconUrl(publicUrlData.publicUrl);
      setIsDirty(true);
      toast({
        title: 'Icon Uploaded',
        description: 'Image uploaded successfully. Save changes to apply.',
        type: 'success',
      });
    } catch (err: unknown) {
      console.error('Failed to upload server icon:', err);
      toast({
        title: 'Upload Failed',
        description: (err as Error)?.message || 'Could not upload icon. You can also paste an image URL directly.',
        type: 'error',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 100) {
      toast({
        title: 'Invalid Name',
        description: 'Server name must be between 1 and 100 characters.',
        type: 'error',
      });
      return;
    }

    if (description.length > 1000) {
      toast({
        title: 'Description Too Long',
        description: 'Server description cannot exceed 1000 characters.',
        type: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      if (onUpdateServer) {
        const res = (await onUpdateServer(server.id, {
          name: trimmedName,
          description: description.trim() || null,
          icon_url: iconUrl.trim() || null,
        })) as { ok?: boolean; error?: string } | undefined;

        if (res && res.ok === false) {
          throw new Error(res.error || 'Failed to update server.');
        }
      }
      setIsDirty(false);
      toast({
        title: 'Server Updated',
        description: 'Overview settings have been saved.',
        type: 'success',
      });
    } catch (err: unknown) {
      toast({
        title: 'Save Failed',
        description: (err as Error)?.message || 'Failed to update server overview settings.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-xl">
      <div>
        <h3 className="text-base font-semibold text-foreground">Server Overview</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage your server&apos;s identity, public details, and icon.
        </p>
      </div>

      {/* Icon Management */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl border border-border bg-card/40">
        <Avatar src={iconUrl || undefined} name={name} size={64} className="rounded-xl" />

        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Server Icon</label>
          <p className="text-xs text-muted-foreground">
            Recommended size: 512x512px. JPG, PNG, or WebP up to 2MB.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canManageServer || uploading}
              onClick={() => fileInputRef.current?.click()}
              className="h-8 text-xs gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Uploading...' : 'Upload Image'}
            </Button>
            {iconUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!canManageServer}
                onClick={() => {
                  setIconUrl('');
                  setIsDirty(true);
                }}
                className="h-8 text-xs text-destructive hover:text-destructive/80"
              >
                Remove Icon
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Direct Icon URL fallback */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
          Icon Image URL (Optional)
        </label>
        <Input
          value={iconUrl}
          onChange={(e) => handleIconUrlChange(e.target.value)}
          placeholder="https://example.com/icon.png"
          disabled={!canManageServer}
          maxLength={2048}
          className="text-xs"
        />
      </div>

      {/* Server Name */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <label className="text-xs font-semibold text-foreground">
            Server Name <span className="text-destructive">*</span>
          </label>
          <span className="text-xs text-muted-foreground">{name.length}/100</span>
        </div>
        <Input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Enter server name"
          disabled={!canManageServer}
          maxLength={100}
          required
          className="text-sm"
        />
      </div>

      {/* Server Description */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <label className="text-xs font-semibold text-foreground">Server Description</label>
          <span className="text-xs text-muted-foreground">{description.length}/1000</span>
        </div>
        <Textarea
          value={description}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          placeholder="Tell visitors what this server is about..."
          disabled={!canManageServer}
          maxLength={1000}
          rows={4}
          className="resize-none text-xs"
        />
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>You have unsaved changes. Don&apos;t forget to save!</span>
        </div>
      )}

      {canManageServer && (
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={saving || !isDirty}
            className="gap-2 text-xs"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}
    </form>
  );
}
