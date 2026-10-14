-- ==============================================================================
-- Migration: 00010_fix_channel_and_voice_rls.sql
-- Description:
--   1. Fix CHANNELS INSERT policy so server owners can always create channels
--      even if their member record is being created in the same transaction.
--   2. Fix CHANNELS SELECT policy so server owners and server members can always
--      view channels for their servers without being blocked by RLS.
--   3. Fix SERVER_MEMBERS SELECT policy so owners and fellow members can view
--      all server members reliably.
-- ==============================================================================

-- 1. CHANNELS INSERT POLICY
DROP POLICY IF EXISTS "Admins can create channels" ON public.channels;
DROP POLICY IF EXISTS "Owners and admins can create channels" ON public.channels;
CREATE POLICY "Owners and admins can create channels"
    ON public.channels FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.servers s
            LEFT JOIN public.server_members sm ON sm.server_id = s.id AND sm.user_id = auth.uid()
            WHERE s.id = channels.server_id
            AND (s.owner_id = auth.uid() OR sm.role IN ('owner', 'admin'))
        )
    );

-- 2. CHANNELS SELECT POLICY
DROP POLICY IF EXISTS "Members can view channels" ON public.channels;
DROP POLICY IF EXISTS "Members and public channels viewable" ON public.channels;
CREATE POLICY "Members and public channels viewable"
    ON public.channels FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.servers s
            LEFT JOIN public.server_members sm ON sm.server_id = s.id AND sm.user_id = auth.uid()
            WHERE s.id = channels.server_id
            AND (s.owner_id IS NULL OR s.owner_id = auth.uid() OR sm.user_id = auth.uid())
        )
    );

-- 3. SERVER MEMBERS SELECT POLICY
DROP POLICY IF EXISTS "Server members can view member lists" ON public.server_members;
CREATE POLICY "Server members can view member lists"
    ON public.server_members FOR SELECT
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.servers s
            LEFT JOIN public.server_members sm ON sm.server_id = s.id AND sm.user_id = auth.uid()
            WHERE s.id = server_members.server_id
            AND (s.owner_id = auth.uid() OR sm.user_id = auth.uid())
        )
    );
