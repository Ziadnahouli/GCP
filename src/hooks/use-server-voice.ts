'use client';

import * as React from 'react';
import {
  useServerVoiceContext,
  VoiceParticipant,
} from '@/features/servers/server-voice-context';
import { SoundboardClip } from '@/lib/soundboard/audio-engine';

export type { VoiceParticipant };

export function useServerVoice(
  channelId?: string,
  serverId?: string,
  serverName?: string,
  channelName?: string
) {
  const context = useServerVoiceContext();

  const isCurrentChannelActive = Boolean(
    context.isVoiceConnected &&
      channelId &&
      context.activeChannelId?.toLowerCase().trim() === channelId.toLowerCase().trim()
  );

  const isCurrentChannelConnecting = Boolean(
    context.isConnecting &&
      channelId &&
      context.activeChannelId?.toLowerCase().trim() === channelId.toLowerCase().trim()
  );

  const { joinVoiceChannel, disconnectVoice } = context;

  const connectVoice = React.useCallback(async () => {
    if (serverId && channelId) {
      await joinVoiceChannel(serverId, channelId, serverName, channelName);
    }
  }, [joinVoiceChannel, serverId, channelId, serverName, channelName]);

  return {
    ...context,
    // When channelId is passed, isVoiceConnected indicates if THIS specific channel is active
    isVoiceConnected: channelId ? isCurrentChannelActive : context.isVoiceConnected,
    isConnecting: channelId ? isCurrentChannelConnecting : context.isConnecting,
    connectVoice,
    disconnectVoice,
    // Only return remote participants of this channel if this channel is active
    remoteParticipants: channelId
      ? isCurrentChannelActive
        ? context.remoteParticipants
        : []
      : context.remoteParticipants,
  };
}
