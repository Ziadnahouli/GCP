-- ==============================================================================
-- Migration: 00015_phase4_fixes.sql
-- Description: Phase 4 Bug Fixes & Enforcements
--   1. Real active devices & sessions table (user_devices)
--   2. Permanent auth.users deletion in delete_user_account RPC
--   3. Automatic notification triggers for DMs and friend requests
--   4. RLS for reports review by server owners/admins
-- ==============================================================================

-- 1. USER DEVICES TABLE (FOR REAL MULTI-DEVICE TRACKING)
CREATE TABLE IF NOT EXISTS public.user_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    user_agent TEXT,
    ip_address TEXT,
    last_active_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT unique_user_device UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_uid ON public.user_devices(user_id);
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own devices" ON public.user_devices;
CREATE POLICY "Users can view own devices"
    ON public.user_devices FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own devices" ON public.user_devices;
CREATE POLICY "Users can manage own devices"
    ON public.user_devices FOR ALL
    USING (auth.uid() = user_id);

ALTER TABLE public.user_devices REPLICA IDENTITY FULL;

-- 2. PERMANENT ACCOUNT DELETION (INCLUDING AUTH.USERS)
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_owned_server RECORD;
    v_owned_conv RECORD;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Clean up owned servers: delete servers where user is sole owner
    FOR v_owned_server IN SELECT id FROM public.servers WHERE owner_id = v_uid
    LOOP
        DELETE FROM public.servers WHERE id = v_owned_server.id;
    END LOOP;

    -- Clean up friendships, blocks, and device sessions
    DELETE FROM public.user_devices WHERE user_id = v_uid;
    DELETE FROM public.friendships WHERE user_id = v_uid OR friend_id = v_uid;
    DELETE FROM public.friend_requests WHERE sender_id = v_uid OR receiver_id = v_uid;
    DELETE FROM public.blocks WHERE blocker_id = v_uid OR blocked_id = v_uid;

    -- Clean up conversation memberships and groups
    FOR v_owned_conv IN SELECT c.id FROM public.conversations c WHERE c.created_by = v_uid AND c.type = 'group'
    LOOP
        PERFORM public.leave_group_conversation(v_owned_conv.id);
    END LOOP;

    DELETE FROM public.conversation_members WHERE user_id = v_uid;
    DELETE FROM public.server_members WHERE user_id = v_uid;
    DELETE FROM public.notifications WHERE user_id = v_uid;
    DELETE FROM public.user_settings WHERE user_id = v_uid;

    -- Delete public profile
    DELETE FROM public.profiles WHERE id = v_uid;

    -- PERMANENTLY DELETE AUTH CREDENTIALS IN SUPABASE AUTH SCHEMA
    DELETE FROM auth.users WHERE id = v_uid;

    RETURN TRUE;
END;
$$;

-- 3. AUTOMATIC NOTIFICATION TRIGGERS FOR MESSAGES
CREATE OR REPLACE FUNCTION public.trigger_message_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member RECORD;
    v_sender_name TEXT;
    v_conv_name TEXT;
    v_conv_type TEXT;
BEGIN
    -- Get sender profile
    SELECT COALESCE(display_name, username, 'Squadmate') INTO v_sender_name
    FROM public.profiles WHERE id = NEW.sender_id;

    -- Get conversation metadata
    SELECT type, name INTO v_conv_type, v_conv_name
    FROM public.conversations WHERE id = NEW.conversation_id;

    -- Notify all other members
    FOR v_member IN
        SELECT user_id FROM public.conversation_members
        WHERE conversation_id = NEW.conversation_id AND user_id <> NEW.sender_id
    LOOP
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            message,
            data
        ) VALUES (
            v_member.user_id,
            'message',
            CASE WHEN v_conv_type = 'group' THEN COALESCE(v_conv_name, 'Squad Group') ELSE v_sender_name END,
            SUBSTRING(NEW.content FROM 1 FOR 100),
            jsonb_build_object(
                'conversation_id', NEW.conversation_id,
                'message_id', NEW.id,
                'sender_id', NEW.sender_id,
                'sender_name', v_sender_name
            )
        );
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_notification ON public.messages;
CREATE TRIGGER trg_message_notification
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_message_notification();

-- 4. AUTOMATIC NOTIFICATION TRIGGERS FOR FRIEND REQUESTS
CREATE OR REPLACE FUNCTION public.trigger_friend_request_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sender_name TEXT;
BEGIN
    SELECT COALESCE(display_name, username, 'A gamer') INTO v_sender_name
    FROM public.profiles WHERE id = NEW.sender_id;

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        data
    ) VALUES (
        NEW.receiver_id,
        'friend_request',
        'New Friend Request',
        v_sender_name || ' sent you a friend request.',
        jsonb_build_object('sender_id', NEW.sender_id, 'sender_name', v_sender_name)
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_friend_request_notification ON public.friend_requests;
CREATE TRIGGER trg_friend_request_notification
    AFTER INSERT ON public.friend_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_friend_request_notification();

-- 5. SERVER MODERATION NOTIFICATIONS (BAN & TIMEOUT)
CREATE OR REPLACE FUNCTION public.ban_server_member(
    p_server_id UUID,
    p_user_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_server_name TEXT;
BEGIN
    IF NOT public.is_server_owner_or_admin(p_server_id, auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient permissions to ban members';
    END IF;

    IF public.is_server_owner(p_server_id, p_user_id) THEN
        RAISE EXCEPTION 'Cannot ban the server owner';
    END IF;

    SELECT name INTO v_server_name FROM public.servers WHERE id = p_server_id;

    -- Remove from server members
    DELETE FROM public.server_members
    WHERE server_id = p_server_id AND user_id = p_user_id;

    -- Add to bans
    INSERT INTO public.server_bans (server_id, user_id, banned_by, reason)
    VALUES (p_server_id, p_user_id, auth.uid(), p_reason)
    ON CONFLICT (server_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, created_at = NOW();

    -- Log action
    INSERT INTO public.moderation_audit_logs (server_id, actor_id, target_id, action, reason)
    VALUES (p_server_id, auth.uid(), p_user_id, 'ban', p_reason);

    -- Notify the banned user immediately
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        data
    ) VALUES (
        p_user_id,
        'system',
        'Banned from ' || COALESCE(v_server_name, 'Server'),
        'You were banned from ' || COALESCE(v_server_name, 'the server') || CASE WHEN p_reason IS NOT NULL AND p_reason <> '' THEN '. Reason: ' || p_reason ELSE '.' END,
        jsonb_build_object('server_id', p_server_id, 'server_name', v_server_name, 'action', 'banned', 'reason', p_reason)
    );

    RETURN TRUE;
END;
$$;

-- Enhanced unban RPC with optional membership restoration
CREATE OR REPLACE FUNCTION public.unban_server_member(
    p_server_id UUID,
    p_user_id UUID,
    p_restore_member BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_server_name TEXT;
BEGIN
    IF NOT public.is_server_owner_or_admin(p_server_id, auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient permissions to unban members';
    END IF;

    SELECT name INTO v_server_name FROM public.servers WHERE id = p_server_id;

    DELETE FROM public.server_bans
    WHERE server_id = p_server_id AND user_id = p_user_id;

    IF p_restore_member THEN
        INSERT INTO public.server_members (server_id, user_id, role)
        VALUES (p_server_id, p_user_id, 'member')
        ON CONFLICT (server_id, user_id) DO NOTHING;
    END IF;

    -- Log action
    INSERT INTO public.moderation_audit_logs (server_id, actor_id, target_id, action, reason)
    VALUES (p_server_id, auth.uid(), p_user_id, 'unban', CASE WHEN p_restore_member THEN 'Unbanned & restored membership' ELSE 'Unbanned' END);

    -- Notify user
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        data
    ) VALUES (
        p_user_id,
        'system',
        'Unbanned from ' || COALESCE(v_server_name, 'Server'),
        'Your ban from ' || COALESCE(v_server_name, 'the server') || ' has been lifted.' || CASE WHEN p_restore_member THEN ' Your membership was restored!' ELSE ' You may now rejoin using an invite link.' END,
        jsonb_build_object('server_id', p_server_id, 'server_name', v_server_name, 'action', 'unbanned', 'restored', p_restore_member)
    );

    RETURN TRUE;
END;
$$;

-- Enhanced timeout RPC with notifications
CREATE OR REPLACE FUNCTION public.timeout_server_member(
    p_server_id UUID,
    p_user_id UUID,
    p_duration_seconds INTEGER,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_timeout_until TIMESTAMPTZ;
    v_server_name TEXT;
    v_minutes INTEGER;
BEGIN
    IF NOT public.is_server_owner_or_admin(p_server_id, auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient permissions to timeout members';
    END IF;

    IF public.is_server_owner(p_server_id, p_user_id) THEN
        RAISE EXCEPTION 'Cannot timeout the server owner';
    END IF;

    SELECT name INTO v_server_name FROM public.servers WHERE id = p_server_id;

    IF p_duration_seconds <= 0 THEN
        v_timeout_until := NULL;
    ELSE
        v_timeout_until := NOW() + (p_duration_seconds || ' seconds')::INTERVAL;
    END IF;

    UPDATE public.server_members
    SET timeout_until = v_timeout_until
    WHERE server_id = p_server_id AND user_id = p_user_id;

    -- Log action
    INSERT INTO public.moderation_audit_logs (server_id, actor_id, target_id, action, reason)
    VALUES (
        p_server_id,
        auth.uid(),
        p_user_id,
        CASE WHEN p_duration_seconds <= 0 THEN 'untimeout' ELSE 'timeout' END,
        p_reason
    );

    IF p_duration_seconds > 0 THEN
        v_minutes := GREATEST(1, ROUND(p_duration_seconds / 60));
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            message,
            data
        ) VALUES (
            p_user_id,
            'system',
            'Timed out in ' || COALESCE(v_server_name, 'Server'),
            'You were timed out in ' || COALESCE(v_server_name, 'the server') || ' for ' || v_minutes || ' minute(s)' || CASE WHEN p_reason IS NOT NULL AND p_reason <> '' THEN '. Reason: ' || p_reason ELSE '.' END,
            jsonb_build_object('server_id', p_server_id, 'server_name', v_server_name, 'action', 'timeout', 'reason', p_reason, 'duration_seconds', p_duration_seconds)
        );
    END IF;

    RETURN TRUE;
END;
$$;

-- 6. POLICIES FOR REPORTS REVIEW BY SERVER ADMINS
DROP POLICY IF EXISTS "Server admins can view reports for their servers" ON public.reports;
CREATE POLICY "Server admins can view reports for their servers"
    ON public.reports FOR SELECT
    USING (
        reporter_id = auth.uid() OR
        (server_id IS NOT NULL AND public.is_server_owner_or_admin(server_id, auth.uid()))
    );

DROP POLICY IF EXISTS "Server admins can update reports for their servers" ON public.reports;
CREATE POLICY "Server admins can update reports for their servers"
    ON public.reports FOR UPDATE
    USING (
        server_id IS NOT NULL AND public.is_server_owner_or_admin(server_id, auth.uid())
    );

