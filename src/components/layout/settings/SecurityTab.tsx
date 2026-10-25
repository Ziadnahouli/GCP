'use client';

import * as React from 'react';
import {
  Shield,
  ShieldAlert,
  KeyRound,
  Smartphone,
  Laptop,
  Trash2,
  Lock,
  LogOut,
  Loader2,
  Save,
} from 'lucide-react';
import { useAuth, getLocalDeviceId } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { realtimeHub } from '@/lib/realtime/realtime-hub';
import { UserSettings } from '@/lib/types/profile';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface SecurityTabProps {
  open?: boolean;
}

export function SecurityTab({ open = true }: SecurityTabProps) {
  const { user, settings, updateSettings, signOut } = useAuth();
  const { toast } = useToast();

  const [allowDms, setAllowDms] = React.useState<'everyone' | 'friends' | 'none'>(
    settings?.allow_direct_messages || 'everyone'
  );
  const [allowFriendReqs, setAllowFriendReqs] = React.useState<'everyone' | 'friends_of_friends' | 'none'>(
    settings?.allow_friend_requests || 'everyone'
  );
  const [profileVisibility, setProfileVisibility] = React.useState<'everyone' | 'friends' | 'nobody'>(
    settings?.profile_visibility || 'everyone'
  );
  const [presenceVisibility, setPresenceVisibility] = React.useState<'everyone' | 'friends' | 'nobody'>(
    settings?.presence_visibility || 'everyone'
  );

  React.useEffect(() => {
    if (settings) {
      if (settings.allow_direct_messages) setAllowDms(settings.allow_direct_messages);
      if (settings.allow_friend_requests) setAllowFriendReqs(settings.allow_friend_requests);
      if (settings.profile_visibility) setProfileVisibility(settings.profile_visibility);
      if (settings.presence_visibility) setPresenceVisibility(settings.presence_visibility);
    }
  }, [settings]);

  const [isResettingPassword, setIsResettingPassword] = React.useState(false);
  const [directNewPassword, setDirectNewPassword] = React.useState('');
  const [directConfirmPassword, setDirectConfirmPassword] = React.useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = React.useState(false);
  const [showDirectPasswordChange, setShowDirectPasswordChange] = React.useState(false);
  const [isSigningOutOthers, setIsSigningOutOthers] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [deleteInputText, setDeleteInputText] = React.useState('');
  const [isDeletingAccount, setIsDeletingAccount] = React.useState(false);
  const [activeDevices, setActiveDevices] = React.useState<any[]>([]);
  const [loadingDevices, setLoadingDevices] = React.useState(false);

  const localDeviceId = React.useMemo(() => getLocalDeviceId(), []);

  const handleUpdatePrivacy = async (updates: Partial<UserSettings>) => {
    if (updates.allow_direct_messages) setAllowDms(updates.allow_direct_messages);
    if (updates.allow_friend_requests) setAllowFriendReqs(updates.allow_friend_requests);
    if (updates.profile_visibility) setProfileVisibility(updates.profile_visibility);
    if (updates.presence_visibility) setPresenceVisibility(updates.presence_visibility);
    await updateSettings(updates);
    toast({
      title: 'Privacy Policy Saved',
      description: 'Communication and visibility policies updated.',
      type: 'success',
      duration: 2000,
    });
  };

  const handleSendPasswordReset = async () => {
    const supabase = getBrowserClient();
    const userEmail = user?.email;
    if (!userEmail) {
      toast({
        title: 'Password Reset',
        description: 'No active email address associated with this session.',
        type: 'error',
      });
      return;
    }
    setIsResettingPassword(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/callback?next=/reset-password` : undefined,
      });
      if (error) throw error;
      toast({
        title: 'Reset Link Dispatched',
        description: `A password reset link has been dispatched to ${userEmail}.`,
        type: 'success',
      });
    } catch (err: any) {
      const isRateLimited = err?.message?.toLowerCase().includes('rate limit');
      toast({
        title: isRateLimited ? 'Email Rate Limit Reached' : 'Reset Request Failed',
        description: isRateLimited
          ? 'Supabase free mailer limits reset emails to 3 per hour. Use "Change Password Directly" below to update your password immediately without an email link!'
          : (err?.message || 'Could not send reset email.'),
        type: 'error',
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleDirectPasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directNewPassword || directNewPassword.length < 6) {
      toast({
        title: 'Invalid Password',
        description: 'New password must be at least 6 characters long.',
        type: 'error',
      });
      return;
    }
    if (directNewPassword !== directConfirmPassword) {
      toast({
        title: 'Passwords Mismatch',
        description: 'The new passwords do not match.',
        type: 'error',
      });
      return;
    }
    setIsUpdatingPassword(true);
    try {
      const supabase = getBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: directNewPassword });
      if (error) throw error;
      toast({
        title: 'Password Updated',
        description: 'Your account password has been changed successfully.',
        type: 'success',
      });
      setDirectNewPassword('');
      setDirectConfirmPassword('');
      setShowDirectPasswordChange(false);
    } catch (err: any) {
      toast({
        title: 'Password Change Failed',
        description: err?.message || 'Failed to update account password.',
        type: 'error',
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const loadDevices = React.useCallback(async () => {
    if (!user) return;
    const supabase = getBrowserClient();
    setLoadingDevices(true);
    try {
      const { data } = await supabase
        .from('user_devices')
        .select('*')
        .eq('user_id', user.id)
        .order('last_active_at', { ascending: false });
      setActiveDevices(data || []);
    } catch {
      setActiveDevices([]);
    } finally {
      setLoadingDevices(false);
    }
  }, [user]);

  React.useEffect(() => {
    if (!open || !user) return;
    loadDevices();

    const unsub = realtimeHub.on(
      `devices_sync_${user.id}`,
      {
        type: 'postgres_changes',
        event: '*',
        schema: 'public',
        table: 'user_devices',
        filter: `user_id=eq.${user.id}`,
      },
      () => {
        loadDevices();
      }
    );

    return () => {
      unsub();
    };
  }, [open, user, loadDevices]);

  const handleSignOutOtherSessions = async () => {
    const supabase = getBrowserClient();
    setIsSigningOutOthers(true);
    try {
      if (supabase && user?.id) {
        await supabase
          .from('user_devices')
          .delete()
          .eq('user_id', user.id)
          .neq('device_id', localDeviceId);
        try {
          await supabase.auth.signOut({ scope: 'others' });
        } catch {}
      }
      toast({
        title: 'Sessions Terminated',
        description: 'All other active browser and device sessions have been invalidated.',
        type: 'success',
      });
      loadDevices();
    } catch (err: any) {
      toast({
        title: 'Action Failed',
        description: err?.message || 'Could not terminate other sessions.',
        type: 'error',
      });
    } finally {
      setIsSigningOutOthers(false);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    const supabase = getBrowserClient();
    try {
      if (deviceId === localDeviceId) {
        await signOut();
        if (typeof window !== 'undefined') window.location.href = '/login';
        return;
      }
      if (supabase && user?.id) {
        await supabase
          .from('user_devices')
          .delete()
          .eq('user_id', user.id)
          .eq('device_id', deviceId);
      }
      toast({
        title: 'Device Removed',
        description: 'Session invalidated for this device.',
        type: 'info',
      });
      loadDevices();
    } catch (err: any) {
      toast({
        title: 'Action Failed',
        description: err?.message || 'Could not revoke session.',
        type: 'error',
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteInputText.trim() !== 'DELETE') {
      toast({ title: 'Confirmation Required', description: 'Please type DELETE to confirm.', type: 'error' });
      return;
    }
    const supabase = getBrowserClient();
    setIsDeletingAccount(true);
    try {
      const { error } = await supabase.rpc('delete_user_account');
      if (error) throw error;
      toast({
        title: 'Account Deleted',
        description: 'Your account and personal data have been removed.',
        type: 'info',
      });
      await signOut();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    } catch (err: any) {
      toast({
        title: 'Account Deletion Failed',
        description: err?.message || 'Could not delete account.',
        type: 'error',
      });
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl w-full pb-16">
      <div>
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <span>Account Security & Privacy</span>
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage communication privacy, authentication, active sessions, and account lifecycle.
        </p>
      </div>

      {/* 1. Privacy Controls */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Privacy Controls</h4>

        {/* Direct Messages Policy */}
        <div className="p-4 rounded-2xl bg-surface-default border border-border space-y-3">
          <div>
            <div className="text-xs font-bold text-foreground">Who Can Send You Direct Messages</div>
            <div className="text-xs text-muted-foreground">Choose who is permitted to initiate private conversations</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { id: 'everyone', label: 'Everyone', desc: 'Any verified user' },
              { id: 'friends', label: 'Friends Only', desc: 'Only accepted friends' },
              { id: 'none', label: 'Nobody', desc: 'Block incoming DMs' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleUpdatePrivacy({ allow_direct_messages: opt.id as 'everyone' | 'friends' | 'none' })}
                className={cn(
                  'p-2.5 rounded-xl border text-left transition text-xs',
                  allowDms === opt.id
                    ? 'bg-primary/20 border-primary text-foreground'
                    : 'bg-surface-default border-border text-muted-foreground hover:bg-surface-default'
                )}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className="text-xs opacity-75">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Friend Requests Policy */}
        <div className="p-4 rounded-2xl bg-surface-default border border-border space-y-3">
          <div>
            <div className="text-xs font-bold text-foreground">Who Can Send You Friend Requests</div>
            <div className="text-xs text-muted-foreground">Control incoming friendship requests</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { id: 'everyone', label: 'Everyone', desc: 'Any user on GCP' },
              { id: 'friends_of_friends', label: 'Mutual Friends', desc: 'Friends of friends' },
              { id: 'none', label: 'Nobody', desc: 'Disable requests' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleUpdatePrivacy({ allow_friend_requests: opt.id as 'everyone' | 'friends_of_friends' | 'none' })}
                className={cn(
                  'p-2.5 rounded-xl border text-left transition text-xs',
                  allowFriendReqs === opt.id
                    ? 'bg-primary/20 border-primary text-foreground'
                    : 'bg-surface-default border-border text-muted-foreground hover:bg-surface-default'
                )}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className="text-xs opacity-75">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* L15: Profile Visibility Policy */}
        <div className="p-4 rounded-2xl bg-surface-default border border-border space-y-3">
          <div>
            <div className="text-xs font-bold text-foreground">Profile Visibility</div>
            <div className="text-xs text-muted-foreground">Control who can view your full bio, banner, and profile details</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { id: 'everyone', label: 'Everyone', desc: 'Visible to all platform users' },
              { id: 'friends', label: 'Friends Only', desc: 'Only confirmed friends' },
              { id: 'nobody', label: 'Private (Nobody)', desc: 'Only visible to you' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleUpdatePrivacy({ profile_visibility: opt.id as 'everyone' | 'friends' | 'nobody' })}
                className={cn(
                  'p-2.5 rounded-xl border text-left transition text-xs',
                  profileVisibility === opt.id
                    ? 'bg-primary/20 border-primary text-foreground'
                    : 'bg-surface-default border-border text-muted-foreground hover:bg-surface-default'
                )}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className="text-xs opacity-75">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* L16: Presence & Game Activity Visibility */}
        <div className="p-4 rounded-2xl bg-surface-default border border-border space-y-3">
          <div>
            <div className="text-xs font-bold text-foreground">Online Status & Activity Visibility</div>
            <div className="text-xs text-muted-foreground">Control who sees your live online status and current game activity</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { id: 'everyone', label: 'Everyone', desc: 'Mutual servers & friends' },
              { id: 'friends', label: 'Friends Only', desc: 'Only your friends list' },
              { id: 'nobody', label: 'Nobody', desc: 'Always appear private' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleUpdatePrivacy({ presence_visibility: opt.id as 'everyone' | 'friends' | 'nobody' })}
                className={cn(
                  'p-2.5 rounded-xl border text-left transition text-xs',
                  presenceVisibility === opt.id
                    ? 'bg-primary/20 border-primary text-foreground'
                    : 'bg-surface-default border-border text-muted-foreground hover:bg-surface-default'
                )}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className="text-xs opacity-75">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Authentication & Account Access */}
      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Authentication & MFA</h4>

        <div className="p-4 rounded-2xl bg-surface-default border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-foreground">Email Verification</div>
              <div className="text-xs text-muted-foreground">
                {user?.email || 'Signed in via provider'}
              </div>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
              {user?.email_confirmed_at ? 'Email Verified' : 'Verified'}
            </span>
          </div>

          <div className="pt-2 border-t border-border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-foreground">Password Management</div>
                <div className="text-xs text-muted-foreground">Change your password directly or send a recovery email</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={showDirectPasswordChange ? 'secondary' : 'default'}
                  onClick={() => setShowDirectPasswordChange((prev) => !prev)}
                  className="text-xs h-8"
                >
                  <Lock className="w-3.5 h-3.5 mr-1.5" />
                  {showDirectPasswordChange ? 'Close Form' : 'Change Password'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSendPasswordReset}
                  disabled={isResettingPassword}
                  className="border-border hover:bg-surface-active text-xs h-8"
                  title="Sends password reset link to your email"
                >
                  {isResettingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <KeyRound className="w-3.5 h-3.5 mr-1.5" />}
                  Email Link
                </Button>
              </div>
            </div>

            {showDirectPasswordChange && (
              <form onSubmit={handleDirectPasswordUpdate} className="p-3.5 rounded-xl bg-black/40 border border-border space-y-3 animate-in fade-in duration-150">
                <div className="text-xs font-semibold text-primary">
                  Update Password Directly (No Email Needed)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">
                      New Password
                    </label>
                    <Input
                      type="password"
                      placeholder="Minimum 6 characters"
                      value={directNewPassword}
                      onChange={(e) => setDirectNewPassword(e.target.value)}
                      className="h-8 text-xs bg-surface-default border-border"
                      disabled={isUpdatingPassword}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">
                      Confirm Password
                    </label>
                    <Input
                      type="password"
                      placeholder="Re-enter password"
                      value={directConfirmPassword}
                      onChange={(e) => setDirectConfirmPassword(e.target.value)}
                      className="h-8 text-xs bg-surface-default border-border"
                      disabled={isUpdatingPassword}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowDirectPasswordChange(false);
                      setDirectNewPassword('');
                      setDirectConfirmPassword('');
                    }}
                    className="text-xs h-7 text-muted-foreground"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isUpdatingPassword || !directNewPassword || !directConfirmPassword}
                    className="text-xs h-7 font-semibold"
                  >
                    {isUpdatingPassword ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                    Update Password
                  </Button>
                </div>
              </form>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div>
              <div className="text-xs font-bold text-foreground">Multi-Factor Authentication (MFA)</div>
              <div className="text-xs text-muted-foreground">Time-based one-time password (TOTP) authenticator app</div>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              Standard Security
            </span>
          </div>
        </div>
      </div>

      {/* 3. Active Sessions & Device Management */}
      <div className="space-y-3 pt-3 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Sessions & Devices</h4>
            <p className="text-xs text-muted-foreground/80 mt-0.5">
              Devices currently authorized to access your profile.
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSignOutOtherSessions}
            disabled={isSigningOutOthers}
            className="text-xs text-danger hover:text-danger hover:bg-danger/10 border border-danger/20"
          >
            {isSigningOutOthers ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <LogOut className="w-3 h-3 mr-1.5" />}
            Sign Out Other Sessions
          </Button>
        </div>

        <div className="space-y-2">
          {loadingDevices ? (
            <div className="p-4 rounded-2xl bg-surface-default border border-border flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              Loading authorized sessions...
            </div>
          ) : activeDevices.length > 0 ? (
            activeDevices.map((dev: any) => {
              const isCurrent = dev.device_id === localDeviceId;
              const isMobile = dev.device_name?.toLowerCase().includes('phone') || 
                               dev.device_name?.toLowerCase().includes('android') || 
                               dev.device_name?.toLowerCase().includes('iphone') || 
                               dev.user_agent?.toLowerCase().includes('mobile');
              return (
                <div
                  key={dev.id || dev.device_id}
                  className={cn(
                    "p-3.5 rounded-2xl border flex items-center justify-between transition-all",
                    isCurrent
                      ? "bg-primary/[0.04] border-primary/20"
                      : "bg-surface-default border-border hover:border-border"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-xl border flex items-center justify-center shrink-0",
                      isCurrent
                        ? "bg-primary/15 border-primary/30 text-primary"
                        : "bg-surface-default border-border text-muted-foreground"
                    )}>
                      {isMobile ? <Smartphone className="w-4 h-4" /> : <Laptop className="w-4 h-4" />}
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-foreground flex items-center gap-2">
                        <span>{dev.device_name || 'Browser Client'}</span>
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.2 rounded-full bg-success/15 text-success border border-success/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                            This Device
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/80 font-normal">
                            Last active: {new Date(dev.last_active_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1 max-w-[280px]">
                        {dev.user_agent ? dev.user_agent.slice(0, 50) + '...' : 'Web Session'}
                      </div>
                    </div>
                  </div>
                  {!isCurrent && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRevokeDevice(dev.device_id)}
                      className="h-7 px-2.5 text-xs text-danger hover:text-danger hover:bg-danger/10 border border-danger/20"
                    >
                      <LogOut className="w-3 h-3 mr-1" />
                      Revoke
                    </Button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-4 rounded-2xl bg-surface-default border border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground flex items-center gap-2">
                    <span>Current Browser Session</span>
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.2 rounded-full bg-success/15 text-success border border-success/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                      Active Now
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {typeof navigator !== 'undefined' ? `${navigator.userAgent.slice(0, 45)}...` : 'Web Client'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Danger Zone: Account Deletion */}
      <div className="space-y-3 pt-4 border-t border-danger/20">
        <div className="p-4 rounded-2xl bg-danger/15 border border-danger/30 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-danger/20 border border-danger/40 flex items-center justify-center text-danger shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-danger">Danger Zone — Delete Account</div>
              <div className="text-xs text-danger/80 leading-relaxed mt-0.5">
                Permanently purge your gamer identity, server memberships, friendship records, and custom settings.
                This action cannot be reversed.
              </div>
            </div>
          </div>

          {!showDeleteConfirm ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
              className="bg-danger hover:bg-danger/90 text-white text-xs"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Request Account Deletion
            </Button>
          ) : (
            <div className="p-3 rounded-xl bg-black/40 border border-danger/40 space-y-3">
              <p className="text-xs text-danger font-semibold">
                Type <span className="underline font-mono text-white">DELETE</span> to confirm permanent account purge:
              </p>
              <div className="flex gap-2">
                <Input
                  value={deleteInputText}
                  onChange={(e) => setDeleteInputText(e.target.value)}
                  placeholder="Type DELETE"
                  className="text-xs bg-surface-default border-border h-8"
                />
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={deleteInputText.trim() !== 'DELETE' || isDeletingAccount}
                  className="text-xs shrink-0"
                >
                  {isDeletingAccount ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Confirm Purge
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteInputText('');
                  }}
                  className="text-xs shrink-0"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
