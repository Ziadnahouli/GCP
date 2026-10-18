'use client';

import * as React from 'react';
import { Phone, PhoneOff, Video, Gamepad2, Users } from 'lucide-react';
import { useCallContext } from '@/features/calls/call-context';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export function IncomingCallModal() {
  const { incomingCall, callStatus, acceptCall, rejectCall } = useCallContext();

  if (callStatus !== 'incoming_ringing' || !incomingCall) {
    return null;
  }

  const isGroup = Boolean(incomingCall.isGroup);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.08] bg-surface-panel p-6 shadow-2xl shadow-black/80 z-10 flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-150">
        {/* Pulsing Ringing Avatar */}
        <div className="relative my-2">
          <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          <div className="relative ring-2 ring-primary/50 rounded-full p-0.5">
            <Avatar
              src={incomingCall.callerAvatar}
              name={incomingCall.callerName}
              size="xl"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-center gap-1.5 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
            {isGroup ? (
              <>
                <Users className="w-4 h-4 animate-pulse" />
                <span>Squad Voice Call</span>
              </>
            ) : incomingCall.isVideo ? (
              <>
                <Video className="w-4 h-4 animate-pulse" />
                <span>Incoming Video Call</span>
              </>
            ) : (
              <>
                <Phone className="w-4 h-4 animate-pulse" />
                <span>Incoming Voice Call</span>
              </>
            )}
          </div>

          <h3 className="text-lg font-semibold text-foreground tracking-tight">
            {isGroup && incomingCall.groupName ? incomingCall.groupName : incomingCall.callerName}
          </h3>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {isGroup
              ? `${incomingCall.callerName} started a call in this squad`
              : 'Calling you on GCP...'}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-3 w-full pt-2">
          {/* Decline Button */}
          <button
            onClick={rejectCall}
            className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-medium text-xs transition-colors"
          >
            <PhoneOff className="w-4 h-4" />
            <span>{isGroup ? 'Dismiss' : 'Decline'}</span>
          </button>

          {/* Accept Button */}
          <button
            onClick={acceptCall}
            className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-sm transition-colors"
          >
            {incomingCall.isVideo ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
            <span>Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
}
