'use client';

import * as React from 'react';
import { Phone, PhoneOff, Video, Users, BellOff } from 'lucide-react';
import { useCallState, useCallActions } from '@/features/calls/call-context';
import { useAuth } from '@/features/auth/auth-provider';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function IncomingCallModal() {
  const { incomingCall, callStatus } = useCallState();
  const { acceptCall, rejectCall } = useCallActions();
  const { profile } = useAuth();

  const [ringTimeRemaining, setRingTimeRemaining] = React.useState(30);

  React.useEffect(() => {
    if (callStatus !== 'incoming_ringing' || !incomingCall) {
      setRingTimeRemaining(30);
      return;
    }

    const timer = setInterval(() => {
      setRingTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          rejectCall();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [callStatus, incomingCall, rejectCall]);

  if (callStatus !== 'incoming_ringing' || !incomingCall) {
    return null;
  }

  const isGroup = Boolean(incomingCall.isGroup);
  const isDND = profile?.status === 'dnd';

  return (
    <>
      {/* Desktop (>= 640px): Non-blocking top floating card banner */}
      <div className="hidden sm:block fixed top-4 right-4 z-call-overlay w-96 rounded-card border border-border bg-card shadow-floating p-4 animate-in slide-in-from-top-4 duration-200">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            <Avatar
              src={incomingCall.callerAvatar}
              name={incomingCall.callerName}
              size="40"
              className="relative ring-2 ring-primary"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
                {isGroup ? (
                  <>
                    <Users className="w-3.5 h-3.5" />
                    <span>Group call</span>
                  </>
                ) : incomingCall.isVideo ? (
                  <>
                    <Video className="w-3.5 h-3.5" />
                    <span>Video call</span>
                  </>
                ) : (
                  <>
                    <Phone className="w-3.5 h-3.5" />
                    <span>Voice call</span>
                  </>
                )}
              </span>

              <span className="text-xs text-muted-foreground font-mono">
                {ringTimeRemaining}s
              </span>
            </div>

            <h3 className="text-sm font-semibold text-foreground truncate mt-0.5">
              {isGroup && incomingCall.groupName ? incomingCall.groupName : incomingCall.callerName}
            </h3>

            <p className="text-xs text-muted-foreground truncate">
              {isGroup
                ? `${incomingCall.callerName} started a call`
                : 'Incoming call...'}
            </p>

            {isDND && (
              <div className="mt-1 flex items-center gap-1 text-xs text-warning">
                <BellOff className="w-3.5 h-3.5" />
                <span>Do not disturb active</span>
              </div>
            )}

            <div className="flex items-center gap-2 mt-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={rejectCall}
                className="flex-1 gap-1.5 h-8 text-xs"
                aria-label={isGroup ? 'Dismiss group call' : 'Decline call'}
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>{isGroup ? 'Dismiss' : 'Decline'}</span>
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={acceptCall}
                className="flex-1 gap-1.5 h-8 text-xs bg-status-online hover:bg-status-online/90 active:bg-status-online/80 text-primary-foreground"
                aria-label="Accept call"
              >
                {incomingCall.isVideo ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                <span>Accept</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile (< 640px): Full-screen call sheet */}
      <div className="sm:hidden fixed inset-0 z-call-overlay flex flex-col justify-between p-6 bg-background animate-in fade-in duration-200">
        <div className="flex justify-between items-center">
          <Badge variant="outline" className="text-xs">
            {isGroup ? 'Group call' : incomingCall.isVideo ? 'Video call' : 'Voice call'}
          </Badge>
          <span className="text-xs text-muted-foreground font-mono">
            Ringing • {ringTimeRemaining}s
          </span>
        </div>

        <div className="flex flex-col items-center text-center my-auto space-y-4">
          <div className="relative my-2">
            <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            <Avatar
              src={incomingCall.callerAvatar}
              name={incomingCall.callerName}
              size="64"
              className="relative ring-4 ring-primary"
            />
          </div>

          <div>
            <h2 className="text-xl font-bold text-foreground">
              {isGroup && incomingCall.groupName ? incomingCall.groupName : incomingCall.callerName}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {isGroup
                ? `${incomingCall.callerName} started a call`
                : 'Incoming call on Nexus'}
            </p>
          </div>

          {isDND && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-warning/10 text-xs text-warning border border-warning/20">
              <BellOff className="w-3.5 h-3.5" />
              <span>Do not disturb active (silent)</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 w-full">
          <Button
            variant="destructive"
            size="lg"
            onClick={rejectCall}
            className="flex-1 gap-2 min-h-[48px] text-xs font-semibold"
            aria-label={isGroup ? 'Dismiss group call' : 'Decline call'}
          >
            <PhoneOff className="w-4 h-4" />
            <span>{isGroup ? 'Dismiss' : 'Decline'}</span>
          </Button>

          <Button
            variant="primary"
            size="lg"
            onClick={acceptCall}
            className="flex-1 gap-2 min-h-[48px] text-xs font-semibold bg-status-online hover:bg-status-online/90 active:bg-status-online/80 text-primary-foreground"
            aria-label="Accept call"
          >
            {incomingCall.isVideo ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
            <span>Accept</span>
          </Button>
        </div>
      </div>
    </>
  );
}
