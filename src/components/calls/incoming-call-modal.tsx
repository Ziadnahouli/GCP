'use client';

import * as React from 'react';
import { Phone, PhoneOff, Video, Gamepad2 } from 'lucide-react';
import { useCallContext } from '@/features/calls/call-context';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export function IncomingCallModal() {
  const { incomingCall, callStatus, acceptCall, rejectCall } = useCallContext();

  if (callStatus !== 'incoming_ringing' || !incomingCall) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm rounded-2xl border border-primary/40 bg-card p-6 shadow-2xl z-10 flex flex-col items-center text-center space-y-5 animate-in zoom-in-95 duration-150">
        {/* Pulsing Ringing Avatar */}
        <div className="relative my-2">
          <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
          <div className="relative ring-4 ring-primary shadow-glow">
            <Avatar
              src={incomingCall.callerAvatar}
              name={incomingCall.callerName}
              size="xl"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-center gap-1.5 text-primary text-xs font-bold uppercase tracking-wider mb-1">
            {incomingCall.isVideo ? (
              <>
                <Video className="w-4 h-4 animate-bounce" />
                <span>Incoming Video Call</span>
              </>
            ) : (
              <>
                <Phone className="w-4 h-4 animate-bounce" />
                <span>Incoming Voice Call</span>
              </>
            )}
          </div>

          <h3 className="text-xl font-extrabold text-foreground tracking-tight">
            {incomingCall.callerName}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Calling you on Nexus Gaming Platform...
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-4 w-full pt-2">
          {/* Decline Button */}
          <button
            onClick={rejectCall}
            className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-600/40 font-bold text-xs transition-colors shadow-sm"
          >
            <PhoneOff className="w-4 h-4" />
            <span>Decline</span>
          </button>

          {/* Accept Button */}
          <button
            onClick={acceptCall}
            className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg hover:shadow-emerald-500/30 transition-all animate-pulse"
          >
            {incomingCall.isVideo ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
            <span>Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
}
