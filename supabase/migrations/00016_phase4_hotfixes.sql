-- ==============================================================================
-- Migration: 00016_phase4_hotfixes.sql
-- Description: Comprehensive Fixes for Realtime Notifications, Reports Queue,
--              DM Privacy Visibility, Device Sessions RPC, and Squad Calls
-- ==============================================================================

-- 1. FIX REPORTS TABLE COLUMNS & ATOMIC RESOLUTION RPC
ALTER TABLE public.reports
    ADD COLUMN IF NOT EXISTS action_taken TEXT,
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.resolve_report(
    p_report_id UUID,
    p_status TEXT DEFAULT 'resolved',
    p_action_taken TEXT DEFAULT 'Action taken by moderator'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_server_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT server_id INTO v_server_id FROM public.reports WHERE id = p_report_id;
    IF v_server_id IS NOT NULL AND NOT public.is_server_owner_or_admin(v_server_id, auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient permissions to resolve reports for this server';
    END IF;

    UPDATE public.reports
    SET status = p_status,
        action_taken = p_action_taken,
        resolved_at = NOW()
    WHERE id = p_report_id;

    RETURN TRUE;
END;
$$;

-- 2. FIX USER SETTINGS PRIVACY VISIBILITY (FOR DM PRIVACY CHECK)
-- Allow authenticated users to view communication settings (allow_direct_messages, allow_friend_requests)
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Anyone can view user communication privacy" ON public.user_settings;
CREATE POLICY "Anyone can view user communication privacy"
    ON public.user_settings FOR SELECT
    USING (true);

-- Dedicated RPC to guarantee DM privacy lookup without RLS ambiguity
CREATE OR REPLACE FUNCTION public.get_user_dm_policy(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_policy TEXT;
    v_friend_policy TEXT;
BEGIN
    SELECT allow_direct_messages, allow_friend_requests
    INTO v_policy, v_friend_policy
    FROM public.user_settings
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'allow_direct_messages', COALESCE(v_policy, 'everyone'),
        'allow_friend_requests', COALESCE(v_friend_policy, 'everyone')
    );
END;
$$;

-- 3. FIX USER_DEVICES RPC & RLS (GUARANTEED MULTI-DEVICE TRACKING)
CREATE OR REPLACE FUNCTION public.record_user_device(
    p_device_id TEXT,
    p_device_name TEXT,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    INSERT INTO public.user_devices (user_id, device_id, device_name, user_agent, last_active_at)
    VALUES (v_uid, p_device_id, p_device_name, p_user_agent, NOW())
    ON CONFLICT (user_id, device_id)
    DO UPDATE SET
        device_name = EXCLUDED.device_name,
        user_agent = EXCLUDED.user_agent,
        last_active_at = NOW();

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Explicit RLS policies for user_devices with WITH CHECK
DROP POLICY IF EXISTS "Users can manage own devices" ON public.user_devices;
DROP POLICY IF EXISTS "Users can insert own devices" ON public.user_devices;
CREATE POLICY "Users can insert own devices"
    ON public.user_devices FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own devices" ON public.user_devices;
CREATE POLICY "Users can update own devices"
    ON public.user_devices FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own devices" ON public.user_devices;
CREATE POLICY "Users can delete own devices"
    ON public.user_devices FOR DELETE
    USING (auth.uid() = user_id);

-- 4. UNBAN AND TIMEOUT RESTORATIONS (ALWAYS RESTORE MEMBERSHIP SO SERVER IS SHOWN)
CREATE OR REPLACE FUNCTION public.unban_server_member(
    p_server_id UUID,
    p_user_id UUID,
    p_restore_member BOOLEAN DEFAULT TRUE
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

    -- Always re-insert into server_members when unbanning unless explicitly false
    IF p_restore_member THEN
        INSERT INTO public.server_members (server_id, user_id, role)
        VALUES (p_server_id, p_user_id, 'member')
        ON CONFLICT (server_id, user_id) DO NOTHING;
    END IF;

    -- Log action
    INSERT INTO public.moderation_audit_logs (server_id, actor_id, target_id, action, reason)
    VALUES (p_server_id, auth.uid(), p_user_id, 'unban', 'Unbanned & restored membership');

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
        'Your ban from ' || COALESCE(v_server_name, 'the server') || ' has been lifted and your membership restored!',
        jsonb_build_object('server_id', p_server_id, 'server_name', v_server_name, 'action', 'unbanned', 'restored', true)
    );

    RETURN TRUE;
END;
$$;

-- Ensure timeout ensures member exists and removes any accidental lingering ban
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

    -- Lift any lingering ban if user is timed out
    DELETE FROM public.server_bans WHERE server_id = p_server_id AND user_id = p_user_id;

    IF p_duration_seconds <= 0 THEN
        v_timeout_until := NULL;
    ELSE
        v_timeout_until := NOW() + (p_duration_seconds || ' seconds')::INTERVAL;
    END IF;

    -- Upsert membership so timed out member is always guaranteed to exist in member list
    INSERT INTO public.server_members (server_id, user_id, role, timeout_until)
    VALUES (p_server_id, p_user_id, 'member', v_timeout_until)
    ON CONFLICT (server_id, user_id)
    DO UPDATE SET timeout_until = EXCLUDED.timeout_until;

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

-- 5. REALTIME REPLICA IDENTITY & PUBLICATION ENROLLMENT (FIXES LIVE NOTIFICATIONS)
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.user_devices REPLICA IDENTITY FULL;
ALTER TABLE public.reports REPLICA IDENTITY FULL;

DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.user_devices;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;
