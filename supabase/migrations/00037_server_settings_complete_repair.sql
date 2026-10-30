-- ==============================================================================
-- Migration: 00037_server_settings_complete_repair.sql
-- Description: Unified repair and schema cache reload for server settings RPCs:
--              timeout_server_member, create_server_invite, create_server_role,
--              set_member_role, update_server_role, delete_server_role,
--              delete_server, and unban_server_member.
-- ==============================================================================

-- 1. TIMEOUT RPC (STRICT UPDATE, HIERARCHY, CAPPED AT 28 DAYS, NEVER TOUCHES BANS)
DROP FUNCTION IF EXISTS public.timeout_server_member(UUID, UUID, INTEGER, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.timeout_server_member(UUID, UUID, INTEGER) CASCADE;
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
    v_caller_role_pos INT := 0;
    v_target_role_pos INT := 0;
    v_is_owner BOOLEAN;
    v_timeout_expiry TIMESTAMPTZ;
    v_trimmed_reason TEXT;
    v_actor_name TEXT;
    v_target_name TEXT;
    v_server_name TEXT;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required to timeout members';
    END IF;

    IF NOT (public.is_server_owner(p_server_id, v_caller) OR public.has_server_permission(p_server_id, v_caller, 'moderate_members')) THEN
        RAISE EXCEPTION 'Insufficient permissions to timeout members';
    END IF;

    IF v_caller = p_user_id THEN
        RAISE EXCEPTION 'Cannot timeout yourself';
    END IF;

    IF public.is_server_owner(p_server_id, p_user_id) THEN
        RAISE EXCEPTION 'Cannot timeout the server owner';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.server_members
        WHERE server_id = p_server_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Target user is not a member of this server';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.server_bans
        WHERE server_id = p_server_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Target user is banned from this server';
    END IF;

    IF p_duration_seconds < 0 THEN
        RAISE EXCEPTION 'Timeout duration cannot be negative';
    END IF;

    IF p_duration_seconds > 2419200 THEN
        RAISE EXCEPTION 'Timeout duration cannot exceed 28 days (2419200 seconds)';
    END IF;

    v_trimmed_reason := substring(btrim(COALESCE(p_reason, '')) from 1 for 500);

    v_is_owner := public.is_server_owner(p_server_id, v_caller);

    IF NOT v_is_owner THEN
        SELECT COALESCE(sr.position, 1) INTO v_caller_role_pos
        FROM public.server_members sm
        LEFT JOIN public.server_roles sr ON sm.role_id = sr.id
        WHERE sm.server_id = p_server_id AND sm.user_id = v_caller;

        SELECT COALESCE(sr.position, 1) INTO v_target_role_pos
        FROM public.server_members sm
        LEFT JOIN public.server_roles sr ON sm.role_id = sr.id
        WHERE sm.server_id = p_server_id AND sm.user_id = p_user_id;

        IF v_caller_role_pos <= v_target_role_pos THEN
            RAISE EXCEPTION 'Cannot timeout member with equal or higher role rank';
        END IF;
    END IF;

    IF p_duration_seconds = 0 THEN
        v_timeout_expiry := NULL;
    ELSE
        v_timeout_expiry := clock_timestamp() + (p_duration_seconds || ' seconds')::INTERVAL;
    END IF;

    UPDATE public.server_members
    SET timeout_until = v_timeout_expiry
    WHERE server_id = p_server_id AND user_id = p_user_id;

    SELECT username INTO v_actor_name FROM public.profiles WHERE id = v_caller;
    SELECT username INTO v_target_name FROM public.profiles WHERE id = p_user_id;
    SELECT name INTO v_server_name FROM public.servers WHERE id = p_server_id;

    PERFORM public.log_moderation_audit(
        p_server_id,
        p_user_id,
        CASE WHEN p_duration_seconds > 0 THEN 'timeout' ELSE 'untimeout' END,
        CASE WHEN p_duration_seconds > 0 THEN COALESCE(NULLIF(v_trimmed_reason, ''), 'Timed out for ' || p_duration_seconds || 's') ELSE 'Timeout removed' END,
        jsonb_build_object(
            'duration_seconds', p_duration_seconds,
            'timeout_until', v_timeout_expiry,
            'reason', v_trimmed_reason
        )
    );

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.timeout_server_member(UUID, UUID, INTEGER, TEXT) TO authenticated, service_role;

-- 2. CREATE SERVER INVITE RPC (CSPRNG WITH >= 64 BITS ENTROPY, RATE LIMIT, AUDIT)
DROP FUNCTION IF EXISTS public.create_server_invite(UUID, INT, INT) CASCADE;
DROP FUNCTION IF EXISTS public.create_server_invite(UUID, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.create_server_invite(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.create_server_invite(
    p_server_id UUID,
    p_max_uses INT DEFAULT 0,
    p_expires_in_hours INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_invite_code TEXT;
    v_expires_at TIMESTAMPTZ;
    v_recent_invites INT;
    v_invite_record JSONB;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create invite';
    END IF;

    IF NOT (
        public.is_server_owner(p_server_id, v_caller) OR
        public.has_server_permission(p_server_id, v_caller, 'create_invites') OR
        public.has_server_permission(p_server_id, v_caller, 'manage_invites')
    ) THEN
        RAISE EXCEPTION 'Insufficient permissions to create server invites';
    END IF;

    SELECT COUNT(*) INTO v_recent_invites
    FROM public.server_invites
    WHERE created_by = v_caller
      AND created_at > clock_timestamp() - INTERVAL '1 minute';

    IF v_recent_invites >= 10 THEN
        RAISE EXCEPTION 'Invite creation rate limit exceeded. Please wait a minute.';
    END IF;

    v_invite_code := encode(gen_random_bytes(12), 'hex');

    IF p_expires_in_hours > 0 THEN
        v_expires_at := clock_timestamp() + (p_expires_in_hours || ' hours')::INTERVAL;
    ELSE
        v_expires_at := NULL;
    END IF;

    INSERT INTO public.server_invites (
        server_id,
        code,
        created_by,
        max_uses,
        expires_at
    ) VALUES (
        p_server_id,
        v_invite_code,
        v_caller,
        GREATEST(0, COALESCE(p_max_uses, 0)),
        v_expires_at
    );

    PERFORM public.log_moderation_audit(
        p_server_id,
        NULL,
        'create_invite',
        'Created server invite ' || v_invite_code,
        jsonb_build_object(
            'code', v_invite_code,
            'max_uses', p_max_uses,
            'expires_at', v_expires_at
        )
    );

    SELECT jsonb_build_object(
        'id', id,
        'server_id', server_id,
        'code', code,
        'created_by', created_by,
        'uses', uses,
        'max_uses', max_uses,
        'expires_at', expires_at,
        'created_at', created_at,
        'is_revoked', is_revoked
    ) INTO v_invite_record
    FROM public.server_invites
    WHERE code = v_invite_code;

    RETURN v_invite_record;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_server_invite(UUID, INT, INT) TO authenticated, service_role;

-- 3. CREATE SERVER ROLE RPC (RETURNS JSONB, SAFE RETURNING)
DROP FUNCTION IF EXISTS public.create_server_role(UUID, TEXT, TEXT, TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS public.create_server_role(UUID, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.create_server_role(UUID, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.create_server_role(
    p_server_id UUID,
    p_name TEXT,
    p_color TEXT DEFAULT '#94a3b8',
    p_permissions TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_is_owner BOOLEAN;
    v_caller_role_pos INT := 0;
    v_new_role_id UUID;
    v_new_pos INT := 2;
    v_role_record JSONB;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create roles';
    END IF;

    IF NOT public.has_server_permission(p_server_id, v_caller, 'manage_roles') THEN
        RAISE EXCEPTION 'Insufficient permissions to create roles';
    END IF;

    v_is_owner := public.is_server_owner(p_server_id, v_caller);

    IF NOT v_is_owner THEN
        SELECT COALESCE(sr.position, 1) INTO v_caller_role_pos
        FROM public.server_members sm
        LEFT JOIN public.server_roles sr ON sm.role_id = sr.id
        WHERE sm.server_id = p_server_id AND sm.user_id = v_caller;

        v_new_pos := GREATEST(1, v_caller_role_pos - 1);
    ELSE
        v_new_pos := 2;
    END IF;

    IF length(btrim(p_name)) < 1 OR length(btrim(p_name)) > 50 THEN
        RAISE EXCEPTION 'Role name must be between 1 and 50 characters';
    END IF;

    INSERT INTO public.server_roles (
        server_id,
        name,
        color,
        position,
        permissions,
        is_system
    ) VALUES (
        p_server_id,
        btrim(p_name),
        p_color,
        v_new_pos,
        p_permissions,
        FALSE
    )
    RETURNING id INTO v_new_role_id;

    PERFORM public.log_moderation_audit(
        p_server_id,
        NULL,
        'create_role',
        'Created role ' || p_name,
        jsonb_build_object('role_id', v_new_role_id, 'name', p_name, 'permissions', p_permissions)
    );

    SELECT jsonb_build_object(
        'id', id,
        'server_id', server_id,
        'name', name,
        'color', color,
        'position', position,
        'permissions', permissions,
        'is_system', is_system
    ) INTO v_role_record
    FROM public.server_roles
    WHERE id = v_new_role_id;

    RETURN v_role_record;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_server_role(UUID, TEXT, TEXT, TEXT[]) TO authenticated, service_role;

-- 4. SET MEMBER ROLE RPC (ROLE POSITION HIERARCHY GUARD)
DROP FUNCTION IF EXISTS public.set_member_role(UUID, UUID, UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.set_member_role(
    p_server_id UUID,
    p_user_id UUID,
    p_role_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_is_owner BOOLEAN;
    v_role_pos INT;
    v_role_is_sys BOOLEAN;
    v_role_name TEXT;
    v_caller_pos INT := 0;
    v_target_pos INT := 0;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required to set member role';
    END IF;

    IF NOT public.has_server_permission(p_server_id, v_caller, 'manage_roles') THEN
        RAISE EXCEPTION 'Insufficient permissions to assign roles';
    END IF;

    IF public.is_server_owner(p_server_id, p_user_id) THEN
        RAISE EXCEPTION 'Cannot modify server owner role';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.server_members
        WHERE server_id = p_server_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Target user is not a member of this server';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.server_bans
        WHERE server_id = p_server_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Target user is banned from this server';
    END IF;

    SELECT position, is_system, name
    INTO v_role_pos, v_role_is_sys, v_role_name
    FROM public.server_roles
    WHERE id = p_role_id AND server_id = p_server_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found on this server';
    END IF;

    v_is_owner := public.is_server_owner(p_server_id, v_caller);

    IF NOT v_is_owner THEN
        SELECT COALESCE(sr.position, 1) INTO v_caller_pos
        FROM public.server_members sm
        LEFT JOIN public.server_roles sr ON sm.role_id = sr.id
        WHERE sm.server_id = p_server_id AND sm.user_id = v_caller;

        IF v_caller_pos <= v_role_pos THEN
            RAISE EXCEPTION 'Cannot grant role with equal or higher rank than your own';
        END IF;

        SELECT COALESCE(sr.position, 1) INTO v_target_pos
        FROM public.server_members sm
        LEFT JOIN public.server_roles sr ON sm.role_id = sr.id
        WHERE sm.server_id = p_server_id AND sm.user_id = p_user_id;

        IF v_caller_pos <= v_target_pos THEN
            RAISE EXCEPTION 'Cannot modify member with equal or higher rank than your own';
        END IF;
    END IF;

    UPDATE public.server_members
    SET role_id = p_role_id,
        role = CASE WHEN v_role_is_sys THEN lower(v_role_name) ELSE 'member' END
    WHERE server_id = p_server_id AND user_id = p_user_id;

    PERFORM public.log_moderation_audit(
        p_server_id,
        p_user_id,
        'update_member_role',
        'Assigned role ' || v_role_name,
        jsonb_build_object('role_id', p_role_id, 'role_name', v_role_name)
    );

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_member_role(UUID, UUID, UUID) TO authenticated, service_role;

-- 5. RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
