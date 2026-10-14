import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const tokenRequestSchema = z.union([
  z
    .object({
      conversationId: z.string().min(1, { message: 'Conversation ID required' }),
      roomName: z
        .string()
        .min(1)
        .regex(/^nexus-room-[a-zA-Z0-9_-]+$/, {
          message: 'Invalid room name format',
        }),
    })
    .refine((data) => data.roomName === `nexus-room-${data.conversationId}`, {
      message: 'roomName must strictly match conversation room identifier',
    }),
  z.object({
    serverId: z.string().min(1, { message: 'Server ID required' }),
    channelId: z.string().min(1, { message: 'Channel ID required' }),
    roomName: z.string().min(1),
  }),
]);

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

    let finalRoomName: string;

    if ('conversationId' in result.data) {
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
      finalRoomName = roomName;
    } else {
      const { serverId, channelId, roomName } = result.data;
      // Verify server membership or server ownership
      const { data: serverRecord } = await supabase
        .from('servers')
        .select('id, owner_id')
        .eq('id', serverId)
        .maybeSingle();

      const { data: memberRecord } = await supabase
        .from('server_members')
        .select('id')
        .eq('server_id', serverId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!memberRecord && serverRecord?.owner_id !== user.id) {
        return NextResponse.json(
          { error: 'Forbidden: You are not a member of this server' },
          { status: 403 }
        );
      }
      finalRoomName = roomName || `nexus-voice-${channelId}`;
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
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;

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
    });
  } catch (err: unknown) {
    console.error('Call token error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
