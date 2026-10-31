'use client';

import * as React from 'react';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAuth } from '@/features/auth/auth-provider';
import { useServers } from '@/hooks/use-servers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { ImageCropDialog } from './ImageCropDialog';
import { ProfileBanner } from './ProfileBanner';
import { useToast } from '@/components/ui/toast';
import { Upload, Trash2, Loader2, Server } from 'lucide-react';

interface ServerProfileEditorProps {
  servers?: Array<{ id: string; name: string }>;
  selectedServerId?: string;
  onServerSelect?: (serverId: string) => void;
}

export const ServerProfileEditor: React.FC<ServerProfileEditorProps> = ({
  servers = [],
  selectedServerId,
  onServerSelect,
}) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { servers: hookServers } = useServers();
  const [dbServers, setDbServers] = React.useState<Array<{ id: string; name: string }>>([]);

  // Fallback: Query server_members directly if props & hook are empty
  React.useEffect(() => {
    if (servers.length === 0 && hookServers.length === 0 && user?.id) {
      const fetchMyServers = async () => {
        const supabase = getBrowserClient();
        const { data } = await supabase
          .from('server_members')
          .select('server_id, servers(id, name)')
          .eq('user_id', user.id);
        if (data) {
          const srvs = data
            .filter((row: any) => row.servers)
            .map((row: any) => ({
              id: row.servers.id,
              name: row.servers.name,
            }));
          setDbServers(srvs);
        }
      };
      fetchMyServers();
    }
  }, [servers.length, hookServers.length, user?.id]);

  const effectiveServers = React.useMemo(() => {
    if (servers.length > 0) return servers;
    if (hookServers.length > 0) return hookServers;
    return dbServers;
  }, [servers, hookServers, dbServers]);

  const [activeServerId, setActiveServerId] = React.useState<string>(
    selectedServerId || (effectiveServers[0]?.id || '')
  );

  React.useEffect(() => {
    if (effectiveServers.length > 0) {
      const exists = effectiveServers.some((s) => s.id === activeServerId);
      if (!activeServerId || !exists) {
        const nextId = effectiveServers[0].id;
        setActiveServerId(nextId);
        onServerSelect?.(nextId);
      }
    }
  }, [effectiveServers, activeServerId, onServerSelect]);
  const [nickname, setNickname] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [pronouns, setPronouns] = React.useState('');
  const [avatarPath, setAvatarPath] = React.useState<string | null>(null);
  const [bannerPath, setBannerPath] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [cropType, setCropType] = React.useState<'avatar' | 'banner' | null>(null);

  // Load existing server profile when active server changes
  React.useEffect(() => {
    if (!activeServerId || !user?.id) return;

    let isMounted = true;
    setIsLoading(true);

    const load = async () => {
      const supabase = getBrowserClient();
      const { data } = await supabase
        .from('server_members')
        .select('nickname, avatar_path, banner_path, bio, pronouns')
        .eq('server_id', activeServerId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (isMounted) {
        setNickname(data?.nickname || '');
        setBio(data?.bio || '');
        setPronouns(data?.pronouns || '');
        setAvatarPath(data?.avatar_path || null);
        setBannerPath(data?.banner_path || null);
        setIsLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [activeServerId, user?.id]);

  const handleSave = async () => {
    if (!activeServerId || !user?.id) return;
    setIsSaving(true);
    try {
      const supabase = getBrowserClient();
      const { error } = await supabase.rpc('update_my_server_profile', {
        p_server_id: activeServerId,
        p_nickname: nickname.trim() || null,
        p_avatar_path: avatarPath || null,
        p_banner_path: bannerPath || null,
        p_bio: bio.trim() || null,
        p_pronouns: pronouns.trim() || null,
      });

      if (error) throw error;

      toast({
        title: 'Server Profile Saved',
        description: 'Your server identity and nickname have been updated.',
        type: 'success',
      });
    } catch (err: any) {
      toast({
        title: 'Save Failed',
        description: err?.message || 'Failed to update server profile.',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (effectiveServers.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground bg-muted/20 border border-border rounded-2xl">
        <Server className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
        <p className="text-sm font-semibold text-foreground">No Servers Joined</p>
        <p className="text-xs mt-1">Join or create a server to customize your server profile and nickname.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Server Picker Tabs */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-foreground">Select Server</label>
        <div className="flex flex-wrap gap-2">
          {effectiveServers.map((srv) => (
            <button
              key={srv.id}
              type="button"
              onClick={() => {
                setActiveServerId(srv.id);
                if (onServerSelect) onServerSelect(srv.id);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                activeServerId === srv.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface-default hover:bg-surface-hover border-border text-muted-foreground'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>{srv.name}</span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
          <p className="text-xs">Loading server profile...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Server Nickname */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-foreground">Server Nickname</label>
              <span className="text-[11px] text-muted-foreground">{nickname.length}/32</span>
            </div>
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={profile?.display_name || 'Global display name'}
              maxLength={32}
              className="text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Leaves as default to use your global display name ({profile?.display_name}).
            </p>
          </div>

          {/* Server Pronouns */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-foreground">Server Pronouns</label>
              <span className="text-[11px] text-muted-foreground">{pronouns.length}/40</span>
            </div>
            <Input
              value={pronouns}
              onChange={(e) => setPronouns(e.target.value)}
              placeholder="e.g. they/them, she/her, he/him"
              maxLength={40}
              className="text-xs"
            />
          </div>

          {/* Server Bio */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-foreground">Server Bio</label>
              <span className="text-[11px] text-muted-foreground">{bio.length}/190</span>
            </div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="About you in this server..."
              maxLength={190}
              rows={3}
              className="w-full text-xs p-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none resize-none"
            />
          </div>

          {/* Server Avatar & Banner Uploads */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {/* Server Avatar */}
            <div className="p-3 rounded-xl border border-border bg-surface-default space-y-2">
              <div className="text-xs font-semibold text-foreground">Server Avatar</div>
              <div className="flex items-center gap-3">
                <Avatar
                  src={avatarPath || profile?.avatar_url}
                  name={nickname || profile?.display_name}
                  size={40}
                />
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCropType('avatar')}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload
                  </Button>
                  {avatarPath && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAvatarPath(null)}
                      className="h-8 w-8 p-0 text-danger hover:text-danger hover:bg-danger/10"
                      title="Clear server avatar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Server Banner */}
            <div className="p-3 rounded-xl border border-border bg-surface-default space-y-2">
              <div className="text-xs font-semibold text-foreground">Server Banner</div>
              <div className="flex items-center gap-3">
                <div className="w-16 h-10 rounded-lg overflow-hidden border border-border">
                  <ProfileBanner
                    bannerPath={bannerPath || profile?.banner_url}
                    bannerColor={profile?.banner_color || '#3b82f6'}
                    className="h-full w-full"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCropType('banner')}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload
                  </Button>
                  {bannerPath && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBannerPath(null)}
                      className="h-8 w-8 p-0 text-danger hover:text-danger hover:bg-danger/10"
                      title="Clear server banner"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-2">
            <Button
              type="button"
              variant="primary"
              onClick={handleSave}
              disabled={isSaving}
              className="text-xs gap-1.5"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Server Profile
            </Button>
          </div>
        </div>
      )}

      {/* Crop Dialog for Server Images */}
      {cropType && (
        <ImageCropDialog
          open={Boolean(cropType)}
          onOpenChange={(op) => !op && setCropType(null)}
          type={cropType}
          onCropComplete={async (result) => {
            const supabase = getBrowserClient();
            const bucket = 'avatars';
            const objectPath = `${user?.id}/${cropType}_server_${activeServerId}_${Date.now()}.webp`;

            const { error: uploadErr } = await supabase.storage
              .from(bucket)
              .upload(objectPath, result.blob, {
                contentType: 'image/webp',
                upsert: true,
              });

            if (uploadErr) {
              toast({
                title: 'Upload Failed',
                description: uploadErr.message,
                type: 'error',
              });
              return;
            }

            if (cropType === 'avatar') {
              setAvatarPath(objectPath);
            } else {
              setBannerPath(objectPath);
            }

            toast({
              title: `${cropType === 'avatar' ? 'Avatar' : 'Banner'} Staged`,
              description: 'Save changes to apply to your server profile.',
              type: 'info',
            });
          }}
        />
      )}
    </div>
  );
};

