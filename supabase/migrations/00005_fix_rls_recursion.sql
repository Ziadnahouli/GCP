-- ==============================================================================
-- Migration: 00005_fix_rls_recursion.sql
-- Fixes infinite recursion in conversation_members & server_members RLS policies,
-- and adds missing INSERT policies for user onboarding.
-- ==============================================================================

-- 1. CONVERSATIONS & CONVERSATION MEMBERS FIX
DROP POLICY IF EXISTS "Users can view conversation members" ON public.conversation_members;
DROP POLICY IF EXISTS "Members can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Members can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Members can insert messages in their conversations" ON public.messages;

-- Helper function: non-recursive membership check for conversations
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

CREATE POLICY "Users can view conversation members"
    ON public.conversation_members FOR SELECT
    USING (
        user_id = auth.uid() OR
        public.is_conversation_member(conversation_id, auth.uid())
    );

CREATE POLICY "Members can view conversations"
    ON public.conversations FOR SELECT
    USING (
        public.is_conversation_member(id, auth.uid())
    );

CREATE POLICY "Members can view messages in their conversations"
    ON public.messages FOR SELECT
    USING (
        public.is_conversation_member(conversation_id, auth.uid())
    );

CREATE POLICY "Members can insert messages in their conversations"
    ON public.messages FOR INSERT
    WITH CHECK (
        auth.uid() = sender_id AND
        public.is_conversation_member(conversation_id, auth.uid())
    );

-- 2. SERVERS, SERVER MEMBERS & CHANNELS RECURSION FIX
DROP POLICY IF EXISTS "Server members can view member lists" ON public.server_members;
DROP POLICY IF EXISTS "Members can view servers" ON public.servers;
DROP POLICY IF EXISTS "Members can view channels" ON public.channels;

-- Helper function: non-recursive membership check for servers
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

CREATE POLICY "Server members can view member lists"
    ON public.server_members FOR SELECT
    USING (
        user_id = auth.uid() OR
        public.is_server_member(server_id, auth.uid())
    );

CREATE POLICY "Members can view servers"
    ON public.servers FOR SELECT
    USING (
        owner_id = auth.uid() OR
        public.is_server_member(id, auth.uid())
    );

CREATE POLICY "Members can view channels"
    ON public.channels FOR SELECT
    USING (
        public.is_server_member(server_id, auth.uid())
    );

-- 3. MISSING INSERT POLICIES FOR ONBOARDING
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own settings" ON public.user_settings;
CREATE POLICY "Users can insert their own settings"
    ON public.user_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);
