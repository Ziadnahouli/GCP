-- ==============================================================================
-- Migration: 00011_fix_infinite_recursion_final.sql
-- Description:
--   Permanently fixes PostgreSQL error 42P17 ("infinite recursion detected in policy for relation server_members")
--   by using SECURITY DEFINER helper functions that bypass RLS when evaluating membership.
-- ==============================================================================

-- 1. SECURITY DEFINER HELPER FUNCTIONS (Bypasses RLS to prevent recursion)
CREATE OR REPLACE FUNCTION public.is_server_member(p_server_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = p_server_id
    AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_server_owner_or_admin(p_server_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.servers s
    LEFT JOIN public.server_members sm ON sm.server_id = s.id AND sm.user_id = p_user_id
    WHERE s.id = p_server_id
    AND (s.owner_id = p_user_id OR sm.role IN ('owner', 'admin', 'moderator'))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conv_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = p_conv_id
    AND user_id = p_user_id
  );
$$;

-- 2. FIX SERVER_MEMBERS RLS (Eliminate recursive join)
DROP POLICY IF EXISTS "Server members can view member lists" ON public.server_members;
CREATE POLICY "Server members can view member lists"
    ON public.server_members FOR SELECT
    USING (
        user_id = auth.uid() OR
        public.is_server_member(server_id, auth.uid())
    );

-- 3. FIX CHANNELS RLS
DROP POLICY IF EXISTS "Members can view channels" ON public.channels;
DROP POLICY IF EXISTS "Members and public channels viewable" ON public.channels;
CREATE POLICY "Members and public channels viewable"
    ON public.channels FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.servers s
            WHERE s.id = channels.server_id AND (s.owner_id IS NULL OR s.owner_id = auth.uid())
        ) OR
        public.is_server_member(server_id, auth.uid())
    );

DROP POLICY IF EXISTS "Admins can create channels" ON public.channels;
DROP POLICY IF EXISTS "Owners and admins can create channels" ON public.channels;
CREATE POLICY "Owners and admins can create channels"
    ON public.channels FOR INSERT
    WITH CHECK (
        public.is_server_owner_or_admin(server_id, auth.uid())
    );

DROP POLICY IF EXISTS "Owners and admins can delete channels" ON public.channels;
CREATE POLICY "Owners and admins can delete channels"
    ON public.channels FOR DELETE
    USING (
        public.is_server_owner_or_admin(server_id, auth.uid())
    );

DROP POLICY IF EXISTS "Owners and admins can update channels" ON public.channels;
CREATE POLICY "Owners and admins can update channels"
    ON public.channels FOR UPDATE
    USING (
        public.is_server_owner_or_admin(server_id, auth.uid())
    );

-- 4. FIX CHANNEL_MESSAGES RLS
DROP POLICY IF EXISTS "Members can view channel messages" ON public.channel_messages;
DROP POLICY IF EXISTS "Members and public channel messages viewable" ON public.channel_messages;
CREATE POLICY "Members and public channel messages viewable"
    ON public.channel_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.channels c
            JOIN public.servers s ON s.id = c.server_id
            WHERE c.id = channel_messages.channel_id
            AND (s.owner_id IS NULL OR s.owner_id = auth.uid() OR public.is_server_member(s.id, auth.uid()))
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
            AND (s.owner_id IS NULL OR s.owner_id = auth.uid() OR public.is_server_member(s.id, auth.uid()))
        )
    );

DROP POLICY IF EXISTS "Channel messages can be deleted by author or admins" ON public.channel_messages;
CREATE POLICY "Channel messages can be deleted by author or admins"
    ON public.channel_messages FOR DELETE
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM public.channels c
            WHERE c.id = channel_messages.channel_id
            AND public.is_server_owner_or_admin(c.server_id, auth.uid())
        )
    );

-- 5. FIX CALL_SESSIONS RLS
DROP POLICY IF EXISTS "Members can view call sessions" ON public.call_sessions;
CREATE POLICY "Members can view call sessions"
    ON public.call_sessions FOR SELECT
    USING (
        caller_id = auth.uid() OR
        (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id, auth.uid())) OR
        (channel_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.channels c
            WHERE c.id = call_sessions.channel_id
            AND public.is_server_member(c.server_id, auth.uid())
        ))
    );

DROP POLICY IF EXISTS "Authenticated users can create call sessions" ON public.call_sessions;
CREATE POLICY "Authenticated users can create call sessions"
    ON public.call_sessions FOR INSERT
    WITH CHECK (
        caller_id = auth.uid() AND (
            (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id, auth.uid())) OR
            (channel_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.channels c
                WHERE c.id = call_sessions.channel_id
                AND public.is_server_member(c.server_id, auth.uid())
            ))
        )
    );

DROP POLICY IF EXISTS "Call participants can update call sessions" ON public.call_sessions;
CREATE POLICY "Call participants can update call sessions"
    ON public.call_sessions FOR UPDATE
    USING (
        caller_id = auth.uid() OR
        (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id, auth.uid())) OR
        (channel_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.channels c
            WHERE c.id = call_sessions.channel_id
            AND public.is_server_member(c.server_id, auth.uid())
        ))
    );
