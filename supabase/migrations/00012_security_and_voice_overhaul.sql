-- ==============================================================================
-- Migration: 00012_security_and_voice_overhaul.sql
-- Description:
--   1. Fix conversation_members self-join vulnerability (remove open self-insert).
--   2. Restrict message edits to author only (sender_id = auth.uid()).
--   3. Add secure pin_conversation_message RPC for conversation moderators.
--   4. Prevent unilateral friendship creation (remove open friendships INSERT).
--   5. Restrict friend_requests updates to receiver only and prevent unauthorized state changes.
--   6. Ensure all SECURITY DEFINER functions have explicit search_path = public.
-- ==============================================================================

-- 1. CONVERSATION MEMBERSHIP SECURITY REPAIR
-- Prevent unauthorized users from inserting themselves into private conversations.
DROP POLICY IF EXISTS "Users can join conversations" ON public.conversation_members;
DROP POLICY IF EXISTS "Conversation admins can add members" ON public.conversation_members;

CREATE POLICY "Conversation admins can add members"
    ON public.conversation_members FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = conversation_members.conversation_id
            AND cm.user_id = auth.uid()
            AND cm.role IN ('owner', 'admin')
        )
    );

-- 2. MESSAGES EDIT SECURITY REPAIR
-- Restrict message content and ownership edits strictly to the original author.
DROP POLICY IF EXISTS "Members can update messages" ON public.messages;
DROP POLICY IF EXISTS "Authors can update their own messages" ON public.messages;

CREATE POLICY "Authors can update their own messages"
    ON public.messages FOR UPDATE
    USING (auth.uid() = sender_id)
    WITH CHECK (auth.uid() = sender_id);

-- Dedicated atomic procedure for message pinning by conversation members
CREATE OR REPLACE FUNCTION public.pin_conversation_message(p_message_id UUID, p_is_pinned BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conv_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT conversation_id INTO v_conv_id
    FROM public.messages
    WHERE id = p_message_id;

    IF v_conv_id IS NULL THEN
        RAISE EXCEPTION 'Message not found';
    END IF;

    IF NOT public.is_conversation_member(v_conv_id, auth.uid()) THEN
        RAISE EXCEPTION 'Forbidden: Not a member of this conversation';
    END IF;

    UPDATE public.messages
    SET is_pinned = p_is_pinned, updated_at = NOW()
    WHERE id = p_message_id;
END;
$$;

-- 3. FRIENDSHIPS & FRIEND REQUESTS SECURITY REPAIR
-- Prevent users from unilaterally creating accepted friendships without receiver consent.
DROP POLICY IF EXISTS "Users can insert friendships" ON public.friendships;

-- Restrict friend request updates: Only the recipient can accept or reject a pending request.
DROP POLICY IF EXISTS "Parties can update their friend requests" ON public.friend_requests;
DROP POLICY IF EXISTS "Receivers can update friend requests" ON public.friend_requests;

CREATE POLICY "Receivers can update friend requests"
    ON public.friend_requests FOR UPDATE
    USING (auth.uid() = receiver_id AND status = 'pending')
    WITH CHECK (auth.uid() = receiver_id AND status IN ('accepted', 'rejected'));

-- Update accept_friend_request to guarantee SECURITY DEFINER and search_path = public
CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    req RECORD;
    existing_conv_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Fetch pending request where caller is the receiver
    SELECT * INTO req FROM public.friend_requests
    WHERE id = request_id AND receiver_id = auth.uid() AND status = 'pending';

    IF req.id IS NULL THEN
        RAISE EXCEPTION 'Friend request not found or not authorized';
    END IF;

    -- Update request status to accepted
    UPDATE public.friend_requests
    SET status = 'accepted', updated_at = NOW()
    WHERE id = req.id;

    -- Insert bidirectional friendship records
    INSERT INTO public.friendships (user_id, friend_id)
    VALUES (req.sender_id, req.receiver_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.friendships (user_id, friend_id)
    VALUES (req.receiver_id, req.sender_id)
    ON CONFLICT DO NOTHING;

    -- Check if direct conversation already exists between the two users
    SELECT c.id INTO existing_conv_id
    FROM public.conversations c
    JOIN public.conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = req.sender_id
    JOIN public.conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = req.receiver_id
    WHERE c.type = 'direct'
    LIMIT 1;

    -- If no direct conversation exists, atomically create one
    IF existing_conv_id IS NULL THEN
        INSERT INTO public.conversations (type, created_by)
        VALUES ('direct', req.receiver_id)
        RETURNING id INTO existing_conv_id;

        INSERT INTO public.conversation_members (conversation_id, user_id, role)
        VALUES 
            (existing_conv_id, req.sender_id, 'member'),
            (existing_conv_id, req.receiver_id, 'member');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'request_id', req.id,
        'conversation_id', existing_conv_id
    );
END;
$$;

-- 4. ATOMIC DIRECT CONVERSATION FUNCTION AUDIT
-- Ensure create_or_get_direct_conversation has explicit SECURITY DEFINER and search_path = public
CREATE OR REPLACE FUNCTION public.create_or_get_direct_conversation(target_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
