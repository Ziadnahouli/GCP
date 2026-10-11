import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const tokenRequestSchema = z.object({
  conversationId: z.string().min(1),
  roomName: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const result = tokenRequestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid room parameters' }, { status: 400 });
    }

    const { conversationId, roomName } = result.data;

    // 1. Verify membership in conversation
    const { data: memberRecord } = await supabase
      .from('conversation_members')
      .select('id, user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!memberRecord) {
      return NextResponse.json(
        { error: 'Forbidden: You are not a member of this conversation' },
        { status: 403 }
      );
    }

    // 2. Fetch user profile for display name
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, username')
      .eq('id', user.id)
      .single();

    const participantName = profile?.display_name || profile?.username || 'Gamer';

    // 3. LiveKit credentials
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl || wsUrl.includes('your-project')) {
      return NextResponse.json(
        {
          message: 'LiveKit credentials not configured. Native WebRTC P2P mesh active.',
          isConfigured: false,
          mode: 'p2p',
        },
        { status: 200 }
      );
    }

    // 4. Issue authenticated LiveKit token
    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: participantName,
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      url: wsUrl,
      isConfigured: true,
    });
  } catch (err: unknown) {
    console.error('Call token error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
