import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const tokenRequestSchema = z.object({
  conversationId: z.string().optional(),
  serverId: z.string().optional(),
  channelId: z.string().optional(),
  roomName: z.string().min(1),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    let authenticatedUser: { id: string } | null = null;

    // 1. Check user from SSR cookies
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        authenticatedUser = data.user;
      }
    } catch {}

    // 2. Fallback: check Authorization Bearer header
    if (!authenticatedUser) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const bearerToken = authHeader.substring(7);
        try {
          const { data } = await supabase.auth.getUser(bearerToken);
          if (data?.user) {
            authenticatedUser = data.user;
          }
        } catch {}
      }
    }

    const body = await request.json().catch(() => ({}));
    const result = tokenRequestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid room parameters', details: result.error.errors }, { status: 400 });
    }

    const targetUserId = authenticatedUser?.id || result.data.userId || body.userId;
    if (!targetUserId) {
      return NextResponse.json({ error: 'Unauthorized: Valid user identity required' }, { status: 401 });
    }

    const finalRoomName = result.data.roomName;

    // 3. Resolve participant display name
    let participantName = result.data.userName || 'Gamer';
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, username')
        .eq('id', targetUserId)
        .maybeSingle();

      if (profile?.display_name || profile?.username) {
        participantName = profile.display_name || profile.username;
      }
    } catch {}

    // 4. LiveKit cloud credentials
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

    // 5. Issue authenticated LiveKit token with grants
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

    return NextResponse.json({
      token,
      url: wsUrl,
      isConfigured: true,
      roomName: finalRoomName,
    });
  } catch (err: unknown) {
    console.error('[LiveKit Token Error]:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
