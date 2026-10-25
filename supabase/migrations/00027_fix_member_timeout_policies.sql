-- Migration: 00027_fix_member_timeout_policies.sql
-- Description:
-- 1. Fix member timeout enforcement (B3): Drop legacy unhardened policy "Members can send channel messages"
--    and establish single strict INSERT policy enforcing timeout_until and rejecting banned users.
-- 2. Enforce timeout check on channel message UPDATE / editing.
-- 3. Add SECURITY DEFINER helper public.is_channel_member_active to accurately check active membership,
--    timeout_until expiration, and server bans without RLS subquery masking.
-- 4. Grant get_server_preview(TEXT) to anon role to support public /invite/<code> landing page (B1/B2).

-- Helper function to check if a user is an active, non-timed-out, non-banned member of the server channel
CREATE OR REPLACE FUNCTION public.is_channel_member_active(p_channel_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.channels c
        JOIN public.server_members sm ON sm.server_id = c.server_id
        WHERE c.id = p_channel_id
        AND sm.user_id = p_user_id
        AND (sm.timeout_until IS NULL OR sm.timeout_until <= NOW())
        AND NOT EXISTS (
            SELECT 1 FROM public.server_bans sb
            WHERE sb.server_id = c.server_id AND sb.user_id = p_user_id
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_channel_member_active(UUID, UUID) TO authenticated;

-- Allow users to view their own ban record
DROP POLICY IF EXISTS "Users can view their own ban" ON public.server_bans;
CREATE POLICY "Users can view their own ban"
    ON public.server_bans FOR SELECT
    USING (user_id = auth.uid());

-- Drop both legacy and conflicting INSERT policies on channel_messages
DROP POLICY IF EXISTS "Members can send channel messages" ON public.channel_messages;
DROP POLICY IF EXISTS "Members can insert channel messages" ON public.channel_messages;

-- Create single unified INSERT policy enforcing active membership, no timeout, and no server ban
CREATE POLICY "Members can insert channel messages"
    ON public.channel_messages FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        public.is_channel_member_active(channel_id, auth.uid())
    );

-- Enforce timeout check and ban check on channel message edits
DROP POLICY IF EXISTS "Users can update their own channel messages" ON public.channel_messages;
CREATE POLICY "Users can update their own channel messages"
    ON public.channel_messages FOR UPDATE
    USING (
        auth.uid() = user_id AND
        public.is_channel_member_active(channel_id, auth.uid())
    )
    WITH CHECK (
        auth.uid() = user_id AND
        public.is_channel_member_active(channel_id, auth.uid())
    );

-- Grant get_server_preview to anon for public invite page preview
GRANT EXECUTE ON FUNCTION public.get_server_preview(TEXT) TO anon;
