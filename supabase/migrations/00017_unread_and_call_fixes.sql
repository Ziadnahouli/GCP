-- ==============================================================================
-- Migration: 00017_unread_and_call_fixes.sql
-- Description: Fix unread counter persistence:
--              1. RLS UPDATE policy on conversation_members for auth.uid() = user_id
--              2. Atomic SECURITY DEFINER mark_conversation_as_read RPC
-- ==============================================================================

-- 1. Conversation Members UPDATE RLS Policy
DROP POLICY IF EXISTS "Users can update their own conversation membership" ON public.conversation_members;
DROP POLICY IF EXISTS "Conversation members can update their own read state" ON public.conversation_members;

CREATE POLICY "Conversation members can update their own read state"
    ON public.conversation_members FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 2. Atomic Function to Mark Conversation as Read
CREATE OR REPLACE FUNCTION public.mark_conversation_as_read(p_conversation_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_now TIMESTAMPTZ := NOW();
BEGIN
    IF v_uid IS NULL THEN
        RETURN NULL;
    END IF;

    UPDATE public.conversation_members
    SET last_read_at = v_now
    WHERE conversation_id = p_conversation_id
      AND user_id = v_uid;

    RETURN v_now;
END;
$$;
