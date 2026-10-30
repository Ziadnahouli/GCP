-- ==============================================================================
-- Migration: 00032_moderation_rpc_and_audit_hardening.sql
-- Description: SS-S2 Timeout RPC Overhaul, SS-S3 Report Resolution Permissions,
--              SS-S4 Moderation Audit Log Protection, SS-S5 Role Hierarchy Enforcement
-- ==============================================================================

-- 1. ROLE HIERARCHY HELPER
CREATE OR REPLACE FUNCTION public.get_member_role_rank(p_role TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE p_role
        WHEN 'owner' THEN 4
        WHEN 'admin' THEN 3
        WHEN 'moderator' THEN 2
        WHEN 'member' THEN 1
        ELSE 0
    END;
$$;

-- 2. SS-S4: HARDEN MODERATION AUDIT LOGS
-- Expand action constraint to cover full audit surface
ALTER TABLE public.moderation_audit_logs DROP CONSTRAINT IF EXISTS moderation_audit_logs_action_check;
ALTER TABLE public.moderation_audit_logs ADD CONSTRAINT moderation_audit_logs_action_check
    CHECK (action IN (
        'kick', 'ban', 'unban', 'timeout', 'untimeout',
        'delete_message', 'revoke_invite', 'create_invite',
        'update_server', 'transfer_ownership',
        'create_channel', 'update_channel', 'delete_channel', 'reorder_channels',
        'create_role', 'update_role', 'delete_role', 'update_member_role',
        'resolve_report', 'member_join', 'member_leave'
    ));

-- DROP direct INSERT policy on moderation_audit_logs (prevents admin forgery)
DROP POLICY IF EXISTS "Server owners and admins can insert audit logs" ON public.moderation_audit_logs;

-- Dedicated audit log insertion helper callable only internally / from definer RPCs
CREATE OR REPLACE FUNCTION public.log_moderation_audit(
    p_server_id UUID,
    p_target_id UUID,
    p_action TEXT,
    p_reason TEXT DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_log_id UUID;
BEGIN
    IF v_actor_id IS NULL THEN
        SELECT owner_id INTO v_actor_id FROM public.servers WHERE id = p_server_id;
    END IF;

    INSERT INTO public.moderation_audit_logs (
        server_id,
        actor_id,
        target_id,
        action,
        reason,
        details,
        created_at
    ) VALUES (
        p_server_id,
        v_actor_id,
        p_target_id,
        p_action,
        p_reason,
        COALESCE(p_details, '{}'::jsonb),
        NOW()
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

-- 3. SS-S2 & SS-S5: HARDEN TIMEOUT RPC
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
    v_caller UUID := auth.uid();
    v_caller_role TEXT;
    v_target_role TEXT;
    v_timeout_until TIMESTAMPTZ;
    v_server_name TEXT;
    v_minutes INTEGER;
    v_is_owner BOOLEAN;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required to timeout members';
    END IF;

    IF v_caller = p_user_id THEN
        RAISE EXCEPTION 'Cannot perform moderation action on yourself';
    END IF;

    IF public.is_server_owner(p_server_id, p_user_id) THEN
        RAISE EXCEPTION 'Cannot timeout the server owner';
    END IF;

    v_is_owner := public.is_server_owner(p_server_id, v_caller);
    IF NOT v_is_owner AND NOT public.is_server_admin(p_server_id, v_caller) THEN
        RAISE EXCEPTION 'Insufficient permissions to timeout members';
    END IF;

    -- Validate target is a member of the server
    SELECT role INTO v_target_role
    FROM public.server_members
    WHERE server_id = p_server_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target user is not a member of this server';
    END IF;

    -- Validate target is not banned
    IF EXISTS (SELECT 1 FROM public.server_bans WHERE server_id = p_server_id AND user_id = p_user_id) THEN
        RAISE EXCEPTION 'Target user is banned from this server';
    END IF;

    -- Hierarchy check: caller must strictly outrank target unless owner
    IF NOT v_is_owner THEN
        SELECT role INTO v_caller_role
        FROM public.server_members
        WHERE server_id = p_server_id AND user_id = v_caller;

        IF public.get_member_role_rank(v_caller_role) <= public.get_member_role_rank(v_target_role) THEN
            RAISE EXCEPTION 'Cannot timeout a member with equal or higher role rank';
        END IF;
    END IF;

    -- Validate bounds
    IF p_duration_seconds < 0 THEN
        RAISE EXCEPTION 'Timeout duration cannot be negative';
    END IF;

    -- Maximum duration 28 days = 2,419,200 seconds
    IF p_duration_seconds > 2419200 THEN
        RAISE EXCEPTION 'Timeout duration cannot exceed 28 days';
    END IF;

    IF p_reason IS NOT NULL AND length(p_reason) > 500 THEN
        RAISE EXCEPTION 'Timeout reason cannot exceed 500 characters';
    END IF;

    SELECT name INTO v_server_name FROM public.servers WHERE id = p_server_id;

    IF p_duration_seconds = 0 THEN
        v_timeout_until := NULL;
    ELSE
        v_timeout_until := NOW() + (p_duration_seconds || ' seconds')::INTERVAL;
    END IF;

    -- UPDATE ONLY on existing member row (NEVER insert non-members and NEVER touch server_bans)
    UPDATE public.server_members
    SET timeout_until = v_timeout_until
    WHERE server_id = p_server_id AND user_id = p_user_id;

    -- Log action via security definer audit logger
    PERFORM public.log_moderation_audit(
        p_server_id,
        p_user_id,
        CASE WHEN p_duration_seconds = 0 THEN 'untimeout' ELSE 'timeout' END,
        p_reason,
        jsonb_build_object('duration_seconds', p_duration_seconds, 'timeout_until', v_timeout_until)
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

-- 4. SS-S5: HARDEN BAN AND KICK RPCS WITH ROLE HIERARCHY
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
    v_caller UUID := auth.uid();
    v_caller_role TEXT;
    v_target_role TEXT;
    v_server_name TEXT;
    v_is_owner BOOLEAN;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required to ban members';
    END IF;

    IF v_caller = p_user_id THEN
        RAISE EXCEPTION 'Cannot perform moderation action on yourself';
    END IF;

    IF public.is_server_owner(p_server_id, p_user_id) THEN
        RAISE EXCEPTION 'Cannot ban the server owner';
    END IF;

    v_is_owner := public.is_server_owner(p_server_id, v_caller);
    IF NOT v_is_owner AND NOT public.is_server_admin(p_server_id, v_caller) THEN
        RAISE EXCEPTION 'Insufficient permissions to ban members';
    END IF;

    -- Check target role rank if target is currently a member
    SELECT role INTO v_target_role
    FROM public.server_members
    WHERE server_id = p_server_id AND user_id = p_user_id;

    IF FOUND AND NOT v_is_owner THEN
        SELECT role INTO v_caller_role
        FROM public.server_members
        WHERE server_id = p_server_id AND user_id = v_caller;

        IF public.get_member_role_rank(v_caller_role) <= public.get_member_role_rank(v_target_role) THEN
            RAISE EXCEPTION 'Cannot ban a member with equal or higher role rank';
        END IF;
    END IF;

    IF p_reason IS NOT NULL AND length(p_reason) > 500 THEN
        RAISE EXCEPTION 'Ban reason cannot exceed 500 characters';
    END IF;

    SELECT name INTO v_server_name FROM public.servers WHERE id = p_server_id;

    -- Remove from server members
    DELETE FROM public.server_members
    WHERE server_id = p_server_id AND user_id = p_user_id;

    -- Add to bans
    INSERT INTO public.server_bans (server_id, user_id, banned_by, reason)
    VALUES (p_server_id, p_user_id, v_caller, p_reason)
    ON CONFLICT (server_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, created_at = NOW();

    -- Log action
    PERFORM public.log_moderation_audit(p_server_id, p_user_id, 'ban', p_reason);

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
        'You have been banned from ' || COALESCE(v_server_name, 'the server') || CASE WHEN p_reason IS NOT NULL AND p_reason <> '' THEN '. Reason: ' || p_reason ELSE '.' END,
        jsonb_build_object('server_id', p_server_id, 'server_name', v_server_name, 'action', 'banned', 'reason', p_reason)
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.kick_server_member(
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
    v_caller UUID := auth.uid();
    v_caller_role TEXT;
    v_target_role TEXT;
    v_server_name TEXT;
    v_is_owner BOOLEAN;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required to kick members';
    END IF;

    IF v_caller = p_user_id THEN
        RAISE EXCEPTION 'Cannot perform moderation action on yourself';
    END IF;

    IF public.is_server_owner(p_server_id, p_user_id) THEN
        RAISE EXCEPTION 'Cannot kick the server owner';
    END IF;

    v_is_owner := public.is_server_owner(p_server_id, v_caller);
    IF NOT v_is_owner AND NOT public.is_server_admin(p_server_id, v_caller) THEN
        RAISE EXCEPTION 'Insufficient permissions to kick members';
    END IF;

    SELECT role INTO v_target_role
    FROM public.server_members
    WHERE server_id = p_server_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target user is not a member of this server';
    END IF;

    IF NOT v_is_owner THEN
        SELECT role INTO v_caller_role
        FROM public.server_members
        WHERE server_id = p_server_id AND user_id = v_caller;

        IF public.get_member_role_rank(v_caller_role) <= public.get_member_role_rank(v_target_role) THEN
            RAISE EXCEPTION 'Cannot kick a member with equal or higher role rank';
        END IF;
    END IF;

    IF p_reason IS NOT NULL AND length(p_reason) > 500 THEN
        RAISE EXCEPTION 'Kick reason cannot exceed 500 characters';
    END IF;

    SELECT name INTO v_server_name FROM public.servers WHERE id = p_server_id;

    DELETE FROM public.server_members
    WHERE server_id = p_server_id AND user_id = p_user_id;

    PERFORM public.log_moderation_audit(p_server_id, p_user_id, 'kick', p_reason);

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        data
    ) VALUES (
        p_user_id,
        'system',
        'Kicked from ' || COALESCE(v_server_name, 'Server'),
        'You have been kicked from ' || COALESCE(v_server_name, 'the server') || CASE WHEN p_reason IS NOT NULL AND p_reason <> '' THEN '. Reason: ' || p_reason ELSE '.' END,
        jsonb_build_object('server_id', p_server_id, 'server_name', v_server_name, 'action', 'kicked', 'reason', p_reason)
    );

    RETURN TRUE;
END;
$$;

-- 5. SS-S3: HARDEN REPORT RESOLUTION
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
    v_is_platform_admin BOOLEAN := FALSE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT server_id INTO v_server_id FROM public.reports WHERE id = p_report_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Report not found';
    END IF;

    IF v_server_id IS NOT NULL THEN
        IF NOT public.is_server_owner_or_admin(v_server_id, auth.uid()) THEN
            RAISE EXCEPTION 'Insufficient permissions to resolve reports for this server';
        END IF;
    ELSE
        -- Platform/DM report: check if caller has platform admin claim or service role
        SELECT COALESCE(
            (auth.role() = 'service_role') OR
            (raw_user_meta_data->>'is_platform_admin')::boolean,
            FALSE
        ) INTO v_is_platform_admin
        FROM auth.users
        WHERE id = auth.uid();

        IF NOT v_is_platform_admin THEN
            RAISE EXCEPTION 'Insufficient permissions to resolve platform reports';
        END IF;
    END IF;

    UPDATE public.reports
    SET status = p_status,
        action_taken = p_action_taken,
        resolved_at = NOW()
    WHERE id = p_report_id;

    RETURN TRUE;
END;
$$;

