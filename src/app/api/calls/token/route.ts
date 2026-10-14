import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const tokenRequestSchema = z.object({
  conversationId: z.string().nullable().optional(),
  serverId: z.string().nullable().optional(),
  channelId: z.string().nullable().optional(),
  roomName: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  userName: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = tokenRequestSchema.safeParse(body);

    const rawData = result.success ? result.data : body || {};

    // 1. Resolve room name with resilient fallbacks
    const finalRoomName =
      (rawData.roomName && String(rawData.roomName).trim()) ||
      (rawData.channelId ? `nexus-voice-${String(rawData.channelId).toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_')}` : '') ||
      (rawData.conversationId ? `nexus-dm-${String(rawData.conversationId).toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_')}` : '') ||
      'nexus-voice-lounge';

    // 2. Resolve target user identity
    let targetUserId =
      (rawData.userId && String(rawData.userId).trim()) ||
      null;

    let participantName =
      (rawData.userName && String(rawData.userName).trim()) ||
      'Gamer';

    // Fallback: check SSR cookies or auth header only if userId not explicitly provided
    if (!targetUserId) {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (data?.user) {
          targetUserId = data.user.id;
          const meta = data.user.user_metadata || {};
          participantName = meta.display_name || meta.username || data.user.email?.split('@')[0] || participantName;
        }
      } catch {}
    }

    if (!targetUserId) {
      targetUserId = 'gamer_' + Math.random().toString(36).slice(2, 9);
    }

    // 3. LiveKit Cloud credentials check
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl || wsUrl.includes('your-project')) {
      console.warn('[LiveKit Token] Missing or placeholder credentials in env');
      return NextResponse.json(
        {
          message: 'LiveKit credentials not configured. Native WebRTC P2P active.',
          isConfigured: false,
          mode: 'p2p',
        },
        { status: 200 }
      );
    }

    // 4. Issue authenticated LiveKit token with grants
    const at = new AccessToken(apiKey, apiSecret, {
      identity: targetUserId,
      name: participantName,
    });

    at.addGrant({
      roomJoin: true,
      room: finalRoomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    console.log('[LiveKit Token] Issued token for room:', finalRoomName, 'user:', targetUserId, 'name:', participantName);

    return NextResponse.json({
      token,
      url: wsUrl,
      isConfigured: true,
      roomName: finalRoomName,
      identity: targetUserId,
      participantName,
    });
  } catch (err: unknown) {
    console.error('[LiveKit Token Error]:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
