-- ==============================================================================
-- Migration: 00002_social_and_messaging_rls.sql
-- Description: Social Policies (Friend Requests, Friendships, Blocks),
--              Conversation Management, Realtime publication, and Atomic functions.
-- ==============================================================================

-- 1. Friend Requests RLS Policies
CREATE POLICY "Users can view their incoming and outgoing friend requests"
    ON public.friend_requests FOR SELECT
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can create friend requests as sender"
    ON public.friend_requests FOR INSERT
    WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Parties can update their friend requests"
    ON public.friend_requests FOR UPDATE
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Parties can delete their friend requests"
    ON public.friend_requests FOR DELETE
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 2. Friendships RLS Policies
CREATE POLICY "Users can view their friendships"
    ON public.friendships FOR SELECT
    USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can delete their friendships"
    ON public.friendships FOR DELETE
    USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can insert friendships"
    ON public.friendships FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 3. Blocks RLS Policies
CREATE POLICY "Users can view users they have blocked"
    ON public.blocks FOR SELECT
    USING (auth.uid() = blocker_id);

CREATE POLICY "Users can block users"
    ON public.blocks FOR INSERT
    WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can unblock users"
    ON public.blocks FOR DELETE
    USING (auth.uid() = blocker_id);

-- 4. Conversation Members RLS Policies
CREATE POLICY "Users can view conversation members"
    ON public.conversation_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = conversation_members.conversation_id
            AND cm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can join conversations"
    ON public.conversation_members FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave conversations"
    ON public.conversation_members FOR DELETE
    USING (auth.uid() = user_id);

-- 5. Notifications RLS Policies
CREATE POLICY "Users can manage their notifications"
    ON public.notifications FOR ALL
    USING (auth.uid() = user_id);

-- 6. Atomic Transaction Function: Accept Friend Request
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

    -- 4. Check if direct conversation already exists between the two
    SELECT c.id INTO existing_conv_id
    FROM public.conversations c
    JOIN public.conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = req.sender_id
    JOIN public.conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = req.receiver_id
    WHERE c.type = 'direct'
    LIMIT 1;

    -- 5. If no direct conversation, create one
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
        'conversation_id', existing_conv_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Atomic Function: Get or Create Direct Conversation
CREATE OR REPLACE FUNCTION public.create_or_get_direct_conversation(target_user_id UUID)
RETURNS UUID AS $$
DECLARE
    conv_id UUID;
    caller_id UUID := auth.uid();
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF caller_id = target_user_id THEN
        RAISE EXCEPTION 'Cannot start direct conversation with yourself';
    END IF;

    -- Check if blocked
    IF EXISTS (
        SELECT 1 FROM public.blocks 
        WHERE (blocker_id = caller_id AND blocked_id = target_user_id)
           OR (blocker_id = target_user_id AND blocked_id = caller_id)
    ) THEN
        RAISE EXCEPTION 'Cannot message blocked user';
    END IF;

    -- Check existing
    SELECT c.id INTO conv_id
    FROM public.conversations c
    JOIN public.conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = caller_id
    JOIN public.conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = target_user_id
    WHERE c.type = 'direct'
    LIMIT 1;

    IF conv_id IS NOT NULL THEN
        RETURN conv_id;
    END IF;

    -- Create new conversation
    INSERT INTO public.conversations (type, created_by)
    VALUES ('direct', caller_id)
    RETURNING id INTO conv_id;

    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES 
        (conv_id, caller_id, 'member'),
        (conv_id, target_user_id, 'member');

    RETURN conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Enable Realtime Replication on Messaging & Social Tables
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
