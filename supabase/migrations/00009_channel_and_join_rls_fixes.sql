-- ==============================================================================
-- Migration: 00009_channel_and_join_rls_fixes.sql
-- Description:
--   1. Add missing DELETE and UPDATE RLS policies on public.channels so channels can be deleted & updated.
--   2. Allow public/authenticated SELECT on public.servers so players can look up and join servers via ID or invite links.
--   3. Add join_server RPC function for atomic, permission-safe server joining.
-- ==============================================================================

-- 1. CHANNELS UPDATE & DELETE RLS POLICIES
DROP POLICY IF EXISTS "Owners and admins can delete channels" ON public.channels;
CREATE POLICY "Owners and admins can delete channels"
    ON public.channels FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.servers s
            LEFT JOIN public.server_members sm ON sm.server_id = s.id AND sm.user_id = auth.uid()
            WHERE s.id = channels.server_id
            AND (s.owner_id = auth.uid() OR sm.role IN ('owner', 'admin', 'moderator'))
        )
    );

DROP POLICY IF EXISTS "Owners and admins can update channels" ON public.channels;
CREATE POLICY "Owners and admins can update channels"
    ON public.channels FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.servers s
            LEFT JOIN public.server_members sm ON sm.server_id = s.id AND sm.user_id = auth.uid()
            WHERE s.id = channels.server_id
            AND (s.owner_id = auth.uid() OR sm.role IN ('owner', 'admin', 'moderator'))
        )
    );

-- 1b. CHANNEL MESSAGES DELETE RLS POLICY
DROP POLICY IF EXISTS "Channel messages can be deleted by author or admins" ON public.channel_messages;
CREATE POLICY "Channel messages can be deleted by author or admins"
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

-- 2. ALLOW SERVERS TO BE DISCOVERED & JOINED BY ID
DROP POLICY IF EXISTS "Members can view servers" ON public.servers;
DROP POLICY IF EXISTS "Members and public servers viewable" ON public.servers;
CREATE POLICY "Members and public servers viewable"
    ON public.servers FOR SELECT
    USING (true); -- Servers can be viewed and discovered by ID / invite link

-- 3. JOIN SERVER FUNCTION (ATOMIC & SECURE)
CREATE OR REPLACE FUNCTION public.join_server_by_id(target_server_id UUID)
RETURNS JSONB AS $$
DECLARE
    srv RECORD;
    caller_id UUID := auth.uid();
    existing_member_id UUID;
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO srv FROM public.servers WHERE id = target_server_id;
    IF srv.id IS NULL THEN
        RAISE EXCEPTION 'Server not found';
    END IF;

    -- Check if already member
    SELECT id INTO existing_member_id FROM public.server_members
    WHERE server_id = target_server_id AND user_id = caller_id;

    IF existing_member_id IS NULL THEN
        INSERT INTO public.server_members (server_id, user_id, role)
        VALUES (target_server_id, caller_id, 'member');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'server_id', target_server_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.join_server_by_id(UUID) TO authenticated;
