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
import { cn } from '@/lib/utils';
import { soundboardEngine } from '@/lib/soundboard/audio-engine';

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

    // 2. AudioContext autoplay check
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const testCtx = new AudioCtx();
        if (testCtx.state === 'running') {
          next.audio = 'granted';
        } else {
          next.audio = 'prompt';
        }
        testCtx.close().catch(() => {});
      }
    } catch {
      next.audio = 'prompt';
    }

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

  const handleClose = () => {
    localStorage.setItem(PERMISSIONS_STORAGE_KEY, 'true');
    if (onOpenChange) onOpenChange(false);
    else setInternalOpen(false);
  };

  const handleAuthorizeAll = async () => {
    setIsAuthorizing(true);
    const updated: PermissionsState = { ...permissions };

    // 1. Microphone & Camera Authorization
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        // Attempt to request both audio and video
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach((track) => track.stop());
        updated.mic = 'granted';
        updated.camera = 'granted';
      } catch (err) {
        console.warn('Dual media request notice, falling back to audio only:', err);
        // Fallback: If camera is absent or rejected, request microphone only
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/85 backdrop-blur-md transition-opacity animate-in fade-in"
        onClick={handleClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg rounded-2xl border border-border/80 bg-surface-default shadow-2xl overflow-hidden flex flex-col z-10 animate-in zoom-in-95 duration-150">
        {/* Glowing Top Ambient Header */}
        <div className="px-6 py-5 border-b border-border/80 bg-surface-sidebar/60 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shadow-glow-sm">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">Welcome to Nexus</h3>
                  <Badge variant="default" className="text-[10px] bg-primary/20 text-primary border-primary/30">
                    Permissions Setup
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Authorize hardware & audio devices for seamless gaming communication.
                </p>
              </div>
            </div>

            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-surface-hover transition-colors"
              title="Close"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Permission Cards List */}
        <div className="p-6 space-y-3 bg-surface-default">
          {/* 1. Microphone */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-surface-sidebar/50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Mic className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  Microphone & Voice
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  Real-time voice rooms, push-to-talk, and squad calls.
                </p>
              </div>
            </div>

            {permissions.mic === 'granted' ? (
              <Badge variant="success" className="text-[10px] shrink-0 gap-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" /> Granted
              </Badge>
            ) : permissions.mic === 'denied' ? (
              <Badge variant="destructive" className="text-[10px] shrink-0 gap-1">
                <AlertCircle className="w-3 h-3" /> Blocked
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">
                Required
              </Badge>
            )}
          </div>

          {/* 2. Camera */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-surface-sidebar/50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                <Video className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  Camera & Video Feed
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  Facecam calling and squad streaming.
                </p>
              </div>
            </div>

            {permissions.camera === 'granted' ? (
              <Badge variant="success" className="text-[10px] shrink-0 gap-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" /> Granted
              </Badge>
            ) : permissions.camera === 'denied' ? (
              <Badge variant="destructive" className="text-[10px] shrink-0 gap-1">
                <AlertCircle className="w-3 h-3" /> Blocked
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">
                Required
              </Badge>
            )}
          </div>

          {/* 3. Audio Autoplay & Soundboard */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-surface-sidebar/50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                <Volume2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  Audio Autoplay & Soundboard
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  Meme soundboard clips and incoming call ringtones.
                </p>
              </div>
            </div>

            {permissions.audio === 'granted' ? (
              <Badge variant="success" className="text-[10px] shrink-0 gap-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" /> Unlocked
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] shrink-0 text-amber-400 border-amber-500/30">
                Pending
              </Badge>
            )}
          </div>

          {/* 4. Desktop Notifications */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-surface-sidebar/50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  Desktop Alerts
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  Direct message pings and call rings when tab is in background.
                </p>
              </div>
            </div>

            {permissions.notifications === 'granted' ? (
              <Badge variant="success" className="text-[10px] shrink-0 gap-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" /> Allowed
              </Badge>
            ) : permissions.notifications === 'denied' ? (
              <Badge variant="destructive" className="text-[10px] shrink-0 gap-1">
                <AlertCircle className="w-3 h-3" /> Blocked
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">
                Optional
              </Badge>
            )}
          </div>

          {/* Denied Tip */}
          {(permissions.mic === 'denied' || permissions.camera === 'denied') && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Permissions Blocked in Browser:</strong> Click the padlock icon 🔒 in your browser URL address bar to re-enable Microphone & Camera access.
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-border/80 bg-surface-sidebar/40 flex items-center justify-between gap-3">
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
            className="gap-2 shadow-glow-sm"
          >
            {isAuthorizing ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Authorizing Devices...</span>
              </>
            ) : authComplete ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>All Permissions Ready!</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Authorize All Needed Permissions</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
