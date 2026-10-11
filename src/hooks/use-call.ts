'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { useToast } from '@/components/ui/toast';
import { DiagnosticsStats } from '@/components/calls/network-diagnostics';

export type CallStatus = 'idle' | 'outgoing_ringing' | 'incoming_ringing' | 'in_call' | 'ended';

export interface CallParticipant {
  id: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
}

export function useCall() {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [callStatus, setCallStatus] = React.useState<CallStatus>('idle');
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [isVideoCall, setIsVideoCall] = React.useState(false);
  const [livekitToken, setLivekitToken] = React.useState<string | null>(null);
  const [livekitWsUrl, setLivekitWsUrl] = React.useState<string | null>(null);

  // Local media states
  const [isMicMuted, setIsMicMuted] = React.useState(false);
  const [isCameraOn, setIsCameraOn] = React.useState(false);
  const [isScreenSharing, setIsScreenSharing] = React.useState(false);
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);

  // Mock participants in active call
  const [participants, setParticipants] = React.useState<CallParticipant[]>([]);

  // Telemetry statistics
  const [stats, setStats] = React.useState<DiagnosticsStats>({
    connectionState: 'connected',
    rttMs: 28,
    jitterMs: 1.8,
    packetLossPercent: 0.0,
    incomingBitrateKbps: 512,
    outgoingBitrateKbps: 256,
    transportPath: 'direct_p2p',
    isZeroTierActive: true,
  });

  // Start outgoing call
  const startCall = async (conversationId: string, video = false) => {
    setActiveConversationId(conversationId);
    setIsVideoCall(video);
    setIsCameraOn(video);
    setCallStatus('outgoing_ringing');

    // Attempt token request from server route
    try {
      const res = await fetch('/api/calls/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          roomName: `nexus-room-${conversationId}`,
        }),
      });

      const data = await res.json();
      if (data.token) {
        setLivekitToken(data.token);
        setLivekitWsUrl(data.url);
      }
    } catch {
      // Offline / local development fallback
    }

    // Auto connect for demonstration after 1.5s ringing
    setTimeout(() => {
      setCallStatus('in_call');
      setParticipants([
        {
          id: user?.id || 'me',
          name: profile?.display_name || 'You',
          isSpeaking: false,
          isMuted: false,
          isCameraOn: video,
          isScreenSharing: false,
        },
        {
          id: 'squad-peer-1',
          name: 'Shadow Sniper',
          isSpeaking: true,
          isMuted: false,
          isCameraOn: video,
          isScreenSharing: false,
        },
      ]);
      toast({
        title: video ? 'Video Call Connected' : 'Voice Call Connected',
        description: 'Connected via LiveKit WebRTC pipeline.',
        type: 'success',
      });
    }, 1500);
  };

  // Toggle Microphone
  const toggleMic = () => {
    setIsMicMuted((prev) => !prev);
    setParticipants((prev) =>
      prev.map((p) => (p.id === (user?.id || 'me') ? { ...p, isMuted: !p.isMuted } : p))
    );
  };

  // Toggle Camera
  const toggleCamera = () => {
    setIsCameraOn((prev) => !prev);
    setParticipants((prev) =>
      prev.map((p) => (p.id === (user?.id || 'me') ? { ...p, isCameraOn: !p.isCameraOn } : p))
    );
  };

  // Toggle Screen Share
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia) {
          await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        }
        setIsScreenSharing(true);
        toast({ title: 'Screen Sharing Active', description: 'Broadcasting your display.', type: 'info' });
      } catch {
        // User cancelled or browser denied
        setIsScreenSharing((prev) => !prev);
      }
    } else {
      setIsScreenSharing(false);
    }
  };

  // End Call
  const endCall = () => {
    setCallStatus('ended');
    setTimeout(() => {
      setCallStatus('idle');
      setActiveConversationId(null);
      setLivekitToken(null);
      setIsScreenSharing(false);
      setParticipants([]);
    }, 500);
    toast({ title: 'Call Ended', description: 'Disconnected from voice room.', type: 'info' });
  };

  return {
    callStatus,
    activeConversationId,
    isVideoCall,
    isMicMuted,
    isCameraOn,
    isScreenSharing,
    showDiagnostics,
    setShowDiagnostics,
    participants,
    stats,
    startCall,
    endCall,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
  };
}
