'use client';

import * as React from 'react';
import {
  Mic,
  Video,
  Volume2,
  Bell,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  X,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { soundboardEngine } from '@/lib/soundboard/audio-engine';
import { getUserMediaAudioConstraints } from '@/lib/webrtc/audio-processing-policy';

const PERMISSIONS_STORAGE_KEY = 'nexus_permissions_configured_v1';

export interface PermissionsState {
  mic: 'granted' | 'prompt' | 'denied' | 'unknown';
  camera: 'granted' | 'prompt' | 'denied' | 'unknown';
  audio: 'granted' | 'prompt' | 'unknown';
  notifications: 'granted' | 'prompt' | 'denied' | 'unknown';
}

export function PermissionsModal({
  open: controlledOpen,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [isAuthorizing, setIsAuthorizing] = React.useState(false);
  const [authComplete, setAuthComplete] = React.useState(false);

  const [permissions, setPermissions] = React.useState<PermissionsState>({
    mic: 'unknown',
    camera: 'unknown',
    audio: 'unknown',
    notifications: 'unknown',
  });

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  // Query existing browser permission states
  const checkCurrentPermissions = React.useCallback(async () => {
    const next: PermissionsState = {
      mic: 'unknown',
      camera: 'unknown',
      audio: 'unknown',
      notifications: 'unknown',
    };

    // 1. Notifications
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') next.notifications = 'granted';
      else if (Notification.permission === 'denied') next.notifications = 'denied';
      else next.notifications = 'prompt';
    }

    // 2. Audio state (deferred until user gesture to prevent blocking page load)
    next.audio = 'prompt';

    // 3. Permissions API for Mic & Camera (if supported by browser)
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      try {
        const micStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        next.mic = micStatus.state as any;
      } catch {
        next.mic = 'prompt';
      }

      try {
        const camStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
        next.camera = camStatus.state as any;
      } catch {
        next.camera = 'prompt';
      }
    } else {
      next.mic = 'prompt';
      next.camera = 'prompt';
    }

    setPermissions(next);
    return next;
  }, []);

  // On first entry, detect whether permissions prompt is needed
  React.useEffect(() => {
    let isMounted = true;

    async function evaluateAutoOpen() {
      const current = await checkCurrentPermissions();
      if (!isMounted) return;

      const hasConfigured = localStorage.getItem(PERMISSIONS_STORAGE_KEY);
      const allGranted =
        current.mic === 'granted' &&
        current.camera === 'granted' &&
        current.notifications === 'granted' &&
        current.audio === 'granted';

      // Automatically show on entry if user hasn't configured them yet and they aren't all granted
      if (!hasConfigured && !allGranted && !isControlled) {
        setInternalOpen(true);
      }
    }

    evaluateAutoOpen();

    // Listen for custom request to reopen permissions modal
    const handleReopen = () => {
      checkCurrentPermissions();
      if (onOpenChange) onOpenChange(true);
      else setInternalOpen(true);
    };

    window.addEventListener('nexus-open-permissions-modal', handleReopen);
    return () => {
      isMounted = false;
      window.removeEventListener('nexus-open-permissions-modal', handleReopen);
    };
  }, [checkCurrentPermissions, isControlled, onOpenChange]);

  const handleClose = React.useCallback(() => {
    localStorage.setItem(PERMISSIONS_STORAGE_KEY, 'true');
    if (onOpenChange) onOpenChange(false);
    else setInternalOpen(false);
  }, [onOpenChange]);

  const handleAuthorizeAll = async () => {
    setIsAuthorizing(true);
    const updated: PermissionsState = { ...permissions };

    // 1. Microphone & Camera Authorization
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        // Attempt to request both audio and video
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: getUserMediaAudioConstraints('browser', null),
          video: true,
        });
        stream.getTracks().forEach((track) => track.stop());
        updated.mic = 'granted';
        updated.camera = 'granted';
      } catch (err) {
        console.warn('Dual media request notice, falling back to audio only:', err);
        // Fallback: If camera is absent or rejected, request microphone only
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: getUserMediaAudioConstraints('browser', null),
          });
          audioStream.getTracks().forEach((track) => track.stop());
          updated.mic = 'granted';
        } catch {
          updated.mic = 'denied';
        }
      }
    }

    // 2. Audio Autoplay & Web Audio API Activation
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        // Play subtle futuristic tactical confirmation ping
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18); // A5
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
        updated.audio = 'granted';
      }
    } catch {
      updated.audio = 'prompt';
    }

    // 3. Desktop Notifications Request
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const notifRes = await Notification.requestPermission();
        updated.notifications = notifRes === 'granted' ? 'granted' : notifRes === 'denied' ? 'denied' : 'prompt';
      } catch {
        updated.notifications = 'prompt';
      }
    }

    setPermissions(updated);
    setIsAuthorizing(false);
    setAuthComplete(true);
    localStorage.setItem(PERMISSIONS_STORAGE_KEY, 'true');

    // Auto-close after brief celebratory confirmation
    setTimeout(() => {
      handleClose();
    }, 1800);
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(val) => { if (!val) handleClose(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden sm:rounded-dialog border border-border bg-card">
        {/* Top Header */}
        <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-border bg-surface-header/70 relative select-none">
          <div className="flex items-center gap-3 pr-8">
            <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-sm font-semibold text-foreground">Welcome to Nexus</DialogTitle>
                <Badge variant="subtle" className="text-xs bg-primary/15 text-primary border-primary/25 px-1.5 py-0">
                  Permissions Setup
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground/70 mt-0.5">
                Authorize hardware & audio devices for seamless gaming communication.
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Permission Cards List */}
        <div className="p-5 sm:p-6 space-y-2.5 bg-surface-panel overflow-y-auto max-h-[60vh]">
          {/* 1. Microphone */}
          <div className="p-3 rounded-lg border border-border bg-surface-default flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-md bg-success/10 border border-success/20 flex items-center justify-center text-success shrink-0">
                <Mic className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  Microphone & Voice
                </div>
                <p className="text-xs text-muted-foreground/60 truncate">
                  Real-time voice rooms, push-to-talk, and squad calls.
                </p>
              </div>
            </div>

            {permissions.mic === 'granted' ? (
              <Badge variant="success" className="text-xs shrink-0 gap-1 bg-success/15 text-success border-success/25 px-1.5 py-0">
                <CheckCircle2 className="w-3 h-3" /> Granted
              </Badge>
            ) : permissions.mic === 'denied' ? (
              <Badge variant="destructive" className="text-xs shrink-0 gap-1 px-1.5 py-0">
                <AlertCircle className="w-3 h-3" /> Blocked
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground/70 border-border px-1.5 py-0">
                Required
              </Badge>
            )}
          </div>

          {/* 2. Camera */}
          <div className="p-3 rounded-lg border border-border bg-surface-default flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-md bg-primary-subtle border border-primary/30 flex items-center justify-center text-primary shrink-0">
                <Video className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  Camera & Video Feed
                </div>
                <p className="text-xs text-muted-foreground/60 truncate">
                  Facecam calling and squad streaming.
                </p>
              </div>
            </div>

            {permissions.camera === 'granted' ? (
              <Badge variant="success" className="text-xs shrink-0 gap-1 bg-success/15 text-success border-success/25 px-1.5 py-0">
                <CheckCircle2 className="w-3 h-3" /> Granted
              </Badge>
            ) : permissions.camera === 'denied' ? (
              <Badge variant="destructive" className="text-xs shrink-0 gap-1 px-1.5 py-0">
                <AlertCircle className="w-3 h-3" /> Blocked
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground/70 border-border px-1.5 py-0">
                Required
              </Badge>
            )}
          </div>

          {/* 3. Audio Autoplay & Soundboard */}
          <div className="p-3 rounded-lg border border-border bg-surface-default flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-md bg-warning/10 border border-warning/20 flex items-center justify-center text-warning shrink-0">
                <Volume2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  Audio Autoplay & Soundboard
                </div>
                <p className="text-xs text-muted-foreground/60 truncate">
                  Meme soundboard clips and incoming call ringtones.
                </p>
              </div>
            </div>

            {permissions.audio === 'granted' ? (
              <Badge variant="success" className="text-xs shrink-0 gap-1 bg-success/15 text-success border-success/25 px-1.5 py-0">
                <CheckCircle2 className="w-3 h-3" /> Unlocked
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs shrink-0 text-warning border-warning/25 px-1.5 py-0">
                Pending
              </Badge>
            )}
          </div>

          {/* 4. Desktop Notifications */}
          <div className="p-3 rounded-lg border border-border bg-surface-default flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  Desktop Alerts
                </div>
                <p className="text-xs text-muted-foreground/60 truncate">
                  Direct message pings and call rings when tab is in background.
                </p>
              </div>
            </div>

            {permissions.notifications === 'granted' ? (
              <Badge variant="success" className="text-xs shrink-0 gap-1 bg-success/15 text-success border-success/25 px-1.5 py-0">
                <CheckCircle2 className="w-3 h-3" /> Allowed
              </Badge>
            ) : permissions.notifications === 'denied' ? (
              <Badge variant="destructive" className="text-xs shrink-0 gap-1 px-1.5 py-0">
                <AlertCircle className="w-3 h-3" /> Blocked
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground/70 border-border px-1.5 py-0">
                Optional
              </Badge>
            )}
          </div>

          {/* Denied Tip */}
          {(permissions.mic === 'denied' || permissions.camera === 'denied') && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Permissions Blocked in Browser:</strong> Click the padlock icon in your browser URL address bar to re-enable Microphone & Camera access.
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-border bg-surface-sidebar/40 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Remind Me Later
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleAuthorizeAll}
            disabled={isAuthorizing}
            className="gap-2 font-medium text-xs shadow-sm"
          >
            {isAuthorizing ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full border-2 border-border border-t-primary-foreground animate-spin" />
                <span>Authorizing Devices...</span>
              </>
            ) : authComplete ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>All Permissions Ready!</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Authorize Permissions</span>
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
