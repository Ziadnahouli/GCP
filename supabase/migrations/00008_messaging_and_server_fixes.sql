-- ==============================================================================
-- Migration: 00008_messaging_and_server_fixes.sql
-- Description: 
--  1. Add missing UPDATE and DELETE RLS policies on messages and conversations.
--  2. Fix race conditions in create_or_get_direct_conversation with advisory lock and search_path.
--  3. Fix search_path on accept_friend_request.
--  4. Allow official community servers (nullable owner_id) and channels RLS.
--  5. Add UPDATE and DELETE RLS policies on channel_messages.
--  6. Seed official community servers with deterministic UUIDs.
-- ==============================================================================

-- 1. CONVERSATIONS UPDATE POLICY
DROP POLICY IF EXISTS "Members can update conversations" ON public.conversations;
CREATE POLICY "Members can update conversations"
    ON public.conversations FOR UPDATE
    USING (public.is_conversation_member(id, auth.uid()));

-- 2. MESSAGES UPDATE & DELETE POLICIES
DROP POLICY IF EXISTS "Senders can edit their own messages" ON public.messages;
DROP POLICY IF EXISTS "Members can update messages" ON public.messages;
CREATE POLICY "Members can update messages"
    ON public.messages FOR UPDATE
    USING (
        auth.uid() = sender_id OR
        public.is_conversation_member(conversation_id, auth.uid())
    )
    WITH CHECK (
        auth.uid() = sender_id OR
        public.is_conversation_member(conversation_id, auth.uid())
    );

DROP POLICY IF EXISTS "Senders can delete their own messages" ON public.messages;
CREATE POLICY "Senders can delete their own messages"
    ON public.messages FOR DELETE
    USING (auth.uid() = sender_id);

-- 3. FIX RACE CONDITION AND SEARCH_PATH IN create_or_get_direct_conversation
CREATE OR REPLACE FUNCTION public.create_or_get_direct_conversation(target_user_id UUID)
RETURNS UUID AS $$
DECLARE
    conv_id UUID;
    caller_id UUID := auth.uid();
    u1 UUID;
    u2 UUID;
    lock_key BIGINT;
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF caller_id = target_user_id THEN
        RAISE EXCEPTION 'Cannot start direct conversation with yourself';
    END IF;

    -- Check if either user has blocked the other
    IF EXISTS (
        SELECT 1 FROM public.blocks 
        WHERE (blocker_id = caller_id AND blocked_id = target_user_id)
           OR (blocker_id = target_user_id AND blocked_id = caller_id)
    ) THEN
        RAISE EXCEPTION 'Cannot message blocked user';
    END IF;

    -- Normalize order of user IDs to create a deterministic advisory transaction lock
    IF caller_id < target_user_id THEN
        u1 := caller_id;
        u2 := target_user_id;
    ELSE
        u1 := target_user_id;
        u2 := caller_id;
    END IF;

    -- 60-bit signed integer hash for transaction-level lock to prevent concurrent duplicates
    lock_key := ('x' || substr(md5(u1::text || ':' || u2::text), 1, 15))::bit(60)::bigint;
    PERFORM pg_advisory_xact_lock(lock_key);

    -- Check existing direct conversation with exactly these two members
    SELECT c.id INTO conv_id
    FROM public.conversations c
    JOIN public.conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = u1
    JOIN public.conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = u2
    WHERE c.type = 'direct'
    LIMIT 1;

    IF conv_id IS NOT NULL THEN
        RETURN conv_id;
    END IF;

    -- Create new direct conversation
    INSERT INTO public.conversations (type, created_by)
    VALUES ('direct', caller_id)
    RETURNING id INTO conv_id;

    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES 
        (conv_id, caller_id, 'member'),
        (conv_id, target_user_id, 'member');

    RETURN conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. FIX SEARCH_PATH IN accept_friend_request
CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id UUID)
RETURNS JSONB AS $$
DECLARE
    req RECORD;
    existing_conv_id UUID;
BEGIN
    -- 1. Fetch pending request where caller is the receiver
    SELECT * INTO req FROM public.friend_requests
    WHERE id = request_id AND receiver_id = auth.uid() AND status = 'pending';

    IF req.id IS NULL THEN
        RAISE EXCEPTION 'Friend request not found or not authorized';
    END IF;

    -- 2. Update request status to accepted
    UPDATE public.friend_requests
    SET status = 'accepted', updated_at = NOW()
    WHERE id = req.id;

    -- 3. Insert bidirectional friendship records
    INSERT INTO public.friendships (user_id, friend_id)
    VALUES (req.sender_id, req.receiver_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.friendships (user_id, friend_id)
    VALUES (req.receiver_id, req.sender_id)
    ON CONFLICT DO NOTHING;

    -- 4. Get or create direct conversation
    existing_conv_id := public.create_or_get_direct_conversation(req.sender_id);

    RETURN jsonb_build_object(
        'success', true,
        'conversation_id', existing_conv_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. SERVERS & CHANNELS FIXES (Support community/default servers without personal owner)
ALTER TABLE public.servers ALTER COLUMN owner_id DROP NOT NULL;

DROP POLICY IF EXISTS "Members can view servers" ON public.servers;
DROP POLICY IF EXISTS "Members and public servers viewable" ON public.servers;
CREATE POLICY "Members and public servers viewable"
    ON public.servers FOR SELECT
    USING (
        owner_id IS NULL OR
        owner_id = auth.uid() OR
        public.is_server_member(id, auth.uid())
    );

DROP POLICY IF EXISTS "Members can view channels" ON public.channels;
DROP POLICY IF EXISTS "Members and public channels viewable" ON public.channels;
CREATE POLICY "Members and public channels viewable"
    ON public.channels FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.servers s
            WHERE s.id = channels.server_id AND s.owner_id IS NULL
        ) OR
        public.is_server_member(server_id, auth.uid())
    );

DROP POLICY IF EXISTS "Members can view channel messages" ON public.channel_messages;
DROP POLICY IF EXISTS "Members and public channel messages viewable" ON public.channel_messages;
CREATE POLICY "Members and public channel messages viewable"
    ON public.channel_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.channels c
            JOIN public.servers s ON s.id = c.server_id
            WHERE c.id = channel_messages.channel_id
            AND (s.owner_id IS NULL OR public.is_server_member(s.id, auth.uid()))
        )
    );

DROP POLICY IF EXISTS "Members can send channel messages" ON public.channel_messages;
CREATE POLICY "Members can send channel messages"
    ON public.channel_messages FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.channels c
            JOIN public.servers s ON s.id = c.server_id
            WHERE c.id = channel_messages.channel_id
            AND (s.owner_id IS NULL OR public.is_server_member(s.id, auth.uid()))
        )
    );

DROP POLICY IF EXISTS "Users can update their own channel messages" ON public.channel_messages;
CREATE POLICY "Users can update their own channel messages"
    ON public.channel_messages FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users or server admins can delete channel messages" ON public.channel_messages;
CREATE POLICY "Users or server admins can delete channel messages"
    ON public.channel_messages FOR DELETE
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM public.channels c
            JOIN public.servers s ON s.id = c.server_id
            LEFT JOIN public.server_members sm ON sm.server_id = s.id AND sm.user_id = auth.uid()
            WHERE c.id = channel_messages.channel_id
            AND (s.owner_id = auth.uid() OR sm.role IN ('owner', 'admin', 'moderator'))
        )
    );

-- 6. SEED OFFICIAL COMMUNITY SERVERS & CHANNELS WITH DETERMINISTIC UUIDS
INSERT INTO public.servers (id, name, description, icon_url, owner_id)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Tactical Squad Alpha', 'Competitive tactical FPS squad & scrims headquarters.', NULL, NULL),
    ('00000000-0000-0000-0000-000000000002', 'Cyber Ranked Grinders', 'High-ELO competitive matchmaking and aim lab analysis.', NULL, NULL)
ON CONFLICT (id) DO UPDATE SET owner_id = NULL;

UPDATE public.servers SET owner_id = NULL 
WHERE id IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');

INSERT INTO public.channels (id, server_id, name, type, topic, position)
VALUES 
    ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'general', 'text', 'General chatter & gaming discussions.', 0),
    ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'tactics-and-strats', 'text', 'Lineups, execute timings, and map callouts.', 1),
    ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 'highlights-and-clips', 'text', 'Ace clips, funny moments, and plays of the game.', 2),
    ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', 'Squad Lounge 1', 'voice', 'Casual hangout voice room.', 3),
    ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000001', 'Competitive Scrims', 'voice', 'Ranked scrim comms only.', 4),
    ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000002', 'lobby-chat', 'text', 'LFG and rank announcements.', 0),
    ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000002', 'Duo Queue Voice', 'voice', 'Duo ranked voice comms.', 1)
ON CONFLICT (id) DO NOTHING;
