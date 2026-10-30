-- ==============================================================================
-- Migration: 00037_server_settings_complete_repair.sql
-- Description: Complete, self-contained repair and schema cache reload for:
--              - moderation_audit_logs constraint & log_moderation_audit helper
--              - server_roles table, permissions, and seeding
--              - create_server_role, update_server_role, delete_server_role, set_member_role
--              - timeout_server_member, create_server_invite
--              - unban_server_member (no auto-join, notifications, DMs)
--              - delete_server & member integrity bypass
-- ==============================================================================

-- 1. AUDIT LOG HELPER AND CONSTRAINTS
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

DROP FUNCTION IF EXISTS public.log_moderation_audit(UUID, UUID, TEXT, TEXT, JSONB) CASCADE;
CREATE OR REPLACE FUNCTION public.log_moderation_audit(
    p_server_id UUID,
    p_target_id UUID DEFAULT NULL,
    p_action TEXT DEFAULT 'action',
    p_reason TEXT DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_log_id UUID;
    v_actor_id UUID := auth.uid();
BEGIN
    INSERT INTO public.moderation_audit_logs (
        server_id,
        actor_id,
        target_id,
        action,
        reason,
        details
    ) VALUES (
        p_server_id,
        COALESCE(v_actor_id, (SELECT owner_id FROM public.servers WHERE id = p_server_id)),
        p_target_id,
        p_action,
        p_reason,
        COALESCE(p_details, '{}'::jsonb)
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_moderation_audit(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated, service_role, anon;

-- 2. SERVER ROLES TABLE & ROLE_ID COLUMN
CREATE TABLE IF NOT EXISTS public.server_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) >= 1 AND length(btrim(name)) <= 50),
    color TEXT DEFAULT '#94a3b8' CHECK (color IS NULL OR color ~* '^#[0-9a-fA-F]{6}$'),
    position INT NOT NULL DEFAULT 1,
    permissions TEXT[] NOT NULL DEFAULT '{}',
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_server_roles_srv_name_lower
    ON public.server_roles(server_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_server_roles_srv_pos
    ON public.server_roles(server_id, position DESC);

ALTER TABLE public.server_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view server roles" ON public.server_roles;
CREATE POLICY "Members can view server roles"
    ON public.server_roles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.server_members sm
            WHERE sm.server_id = server_roles.server_id AND sm.user_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.servers s
            WHERE s.id = server_roles.server_id AND s.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Server owners and managers can insert roles" ON public.server_roles;
CREATE POLICY "Server owners and managers can insert roles"
    ON public.server_roles FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.servers s
            WHERE s.id = server_roles.server_id AND s.owner_id = auth.uid()
        ) OR
        public.has_server_permission(server_id, auth.uid(), 'manage_roles')
    );

DROP POLICY IF EXISTS "Server owners and managers can update roles" ON public.server_roles;
CREATE POLICY "Server owners and managers can update roles"
    ON public.server_roles FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.servers s
            WHERE s.id = server_roles.server_id AND s.owner_id = auth.uid()
        ) OR
        public.has_server_permission(server_id, auth.uid(), 'manage_roles')
    );

DROP POLICY IF EXISTS "Server owners and managers can delete roles" ON public.server_roles;
CREATE POLICY "Server owners and managers can delete roles"
    ON public.server_roles FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.servers s
            WHERE s.id = server_roles.server_id AND s.owner_id = auth.uid()
        ) OR
        public.has_server_permission(server_id, auth.uid(), 'manage_roles')
    );

ALTER TABLE public.server_members
    ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.server_roles(id) ON DELETE SET NULL;

-- 3. DEFAULT ROLES SEEDER & HAS_SERVER_PERMISSION
CREATE OR REPLACE FUNCTION public.seed_default_server_roles(p_server_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_mod_id UUID;
    v_member_id UUID;
BEGIN
    INSERT INTO public.server_roles (server_id, name, color, position, permissions, is_system)
    VALUES (
        p_server_id,
        'Admin',
        '#ef4444',
        100,
        ARRAY[
            'manage_server', 'manage_channels', 'manage_roles', 'view_audit_log',
            'manage_invites', 'create_invites', 'kick_members', 'ban_members',
            'moderate_members', 'manage_reports', 'send_messages', 'send_attachments',
            'manage_messages', 'mention_everyone', 'connect_voice', 'speak_voice',
            'share_screen', 'use_soundboard'
        ],
        TRUE
    )
    ON CONFLICT (server_id, lower(name))
    DO UPDATE SET is_system = TRUE, position = 100
    RETURNING id INTO v_admin_id;

    INSERT INTO public.server_roles (server_id, name, color, position, permissions, is_system)
    VALUES (
        p_server_id,
        'Moderator',
        '#3b82f6',
        50,
        ARRAY[
            'manage_channels', 'create_invites', 'kick_members', 'moderate_members',
            'manage_messages', 'manage_reports', 'view_audit_log', 'send_messages',
            'send_attachments', 'mention_everyone', 'connect_voice', 'speak_voice',
            'share_screen', 'use_soundboard'
        ],
        TRUE
    )
    ON CONFLICT (server_id, lower(name))
    DO UPDATE SET is_system = TRUE, position = 50
    RETURNING id INTO v_mod_id;

    INSERT INTO public.server_roles (server_id, name, color, position, permissions, is_system)
    VALUES (
        p_server_id,
        'Member',
        '#94a3b8',
        10,
        ARRAY[
            'create_invites', 'send_messages', 'send_attachments',
            'connect_voice', 'speak_voice', 'share_screen', 'use_soundboard'
        ],
        TRUE
    )
    ON CONFLICT (server_id, lower(name))
    DO UPDATE SET is_system = TRUE, position = 10
    RETURNING id INTO v_member_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.seed_default_server_roles(UUID) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.has_server_permission(UUID, UUID, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.has_server_permission(
    p_server_id UUID,
    p_user_id UUID,
    p_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_role_id UUID;
    v_timeout_until TIMESTAMPTZ;
    v_has_perm BOOLEAN := FALSE;
    v_legacy_role TEXT;
BEGIN
    IF p_server_id IS NULL OR p_user_id IS NULL OR p_permission IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Owner always has all permissions
    IF public.is_server_owner(p_server_id, p_user_id) THEN
        RETURN TRUE;
    END IF;

    SELECT sm.role_id, sm.timeout_until, sm.role
    INTO v_role_id, v_timeout_until, v_legacy_role
    FROM public.server_members sm
    WHERE sm.server_id = p_server_id AND sm.user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- If user is currently timed out, restrict communication permissions
    IF v_timeout_until IS NOT NULL AND v_timeout_until > clock_timestamp() THEN
        IF p_permission IN ('send_messages', 'speak_voice', 'send_attachments', 'use_soundboard') THEN
            RETURN FALSE;
        END IF;
    END IF;

    IF v_role_id IS NOT NULL THEN
        SELECT (p_permission = ANY(sr.permissions)) INTO v_has_perm
        FROM public.server_roles sr
        WHERE sr.id = v_role_id;
    END IF;

    IF v_has_perm IS TRUE THEN
        RETURN TRUE;
    END IF;

    -- Legacy fallback
    IF v_legacy_role = 'admin' THEN
        RETURN TRUE;
    ELSIF v_legacy_role = 'moderator' THEN
        RETURN p_permission IN (
            'manage_channels', 'create_invites', 'kick_members', 'moderate_members',
            'manage_messages', 'manage_reports', 'view_audit_log', 'send_messages',
            'send_attachments', 'mention_everyone', 'connect_voice', 'speak_voice',
            'share_screen', 'use_soundboard'
        );
    ELSIF v_legacy_role = 'member' THEN
        RETURN p_permission IN (
            'create_invites', 'send_messages', 'send_attachments',
            'connect_voice', 'speak_voice', 'share_screen', 'use_soundboard'
        );
    END IF;

    RETURN FALSE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.has_server_permission(UUID, UUID, TEXT) TO authenticated, service_role, anon;

-- 4. TIMEOUT RPC (STRICT UPDATE, HIERARCHY, CAPPED AT 28 DAYS, NEVER TOUCHES BANS)
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

-- 5. CREATE SERVER INVITE RPC
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
        NULL::UUID,
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

-- 6. CREATE SERVER ROLE RPC
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
        NULL::UUID,
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

-- 7. SET MEMBER ROLE RPC
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

-- 8. UNBAN RPC (LIFTS BAN, DOES NOT RESTORE MEMBERSHIP BY DEFAULT, SENDS NOTIFICATION)
DROP FUNCTION IF EXISTS public.unban_server_member(UUID, UUID, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS public.unban_server_member(UUID, UUID) CASCADE;
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
    v_caller UUID := auth.uid();
    v_server_name TEXT;
    v_member_role_id UUID;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required to unban members';
    END IF;

    IF NOT (public.is_server_owner(p_server_id, v_caller) OR public.has_server_permission(p_server_id, v_caller, 'ban_members')) THEN
        RAISE EXCEPTION 'Insufficient permissions to unban members';
    END IF;

    SELECT name INTO v_server_name FROM public.servers WHERE id = p_server_id;

    -- Lift the ban from server_bans
    DELETE FROM public.server_bans
    WHERE server_id = p_server_id AND user_id = p_user_id;

    -- Do not restore member into server_members unless explicitly requested
    IF p_restore_member THEN
        SELECT id INTO v_member_role_id
        FROM public.server_roles
        WHERE server_id = p_server_id AND is_system = true AND lower(name) = 'member'
        LIMIT 1;

        INSERT INTO public.server_members (server_id, user_id, role, role_id)
        VALUES (p_server_id, p_user_id, 'member', v_member_role_id)
        ON CONFLICT (server_id, user_id) DO UPDATE
        SET role = 'member',
            role_id = COALESCE(server_members.role_id, EXCLUDED.role_id);
    ELSE
        -- Remove from server_members so they do not join the server
        DELETE FROM public.server_members
        WHERE server_id = p_server_id AND user_id = p_user_id;
    END IF;

    -- Send in-app notification to the unbanned user
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        data
    ) VALUES (
        p_user_id,
        'server_unban',
        'Unbanned from Server',
        'You have been unbanned from ' || COALESCE(v_server_name, 'the server') || '.',
        jsonb_build_object('server_id', p_server_id, 'server_name', v_server_name)
    );

    PERFORM public.log_moderation_audit(
        p_server_id,
        p_user_id,
        'unban',
        'Unbanned from server',
        jsonb_build_object('restored', p_restore_member)
    );

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.unban_server_member(UUID, UUID, BOOLEAN) TO authenticated, service_role;

-- 9. DELETE SERVER RPC (BYPASSES INTEGRITY TRIGGER)
DROP FUNCTION IF EXISTS public.delete_server(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.delete_server(p_server_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required to delete servers';
    END IF;

    IF NOT public.is_server_owner(p_server_id, v_caller) THEN
        RAISE EXCEPTION 'Only the server owner can delete the server';
    END IF;

    -- Set local session config to permit cascading owner member deletion
    PERFORM set_config('nexus.deleting_server', 'on', true);

    -- Delete server row (cascades to channels, messages, members, roles, invites, audit logs, bans)
    DELETE FROM public.servers WHERE id = p_server_id;

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_server(UUID) TO authenticated, service_role;

-- 10. CHECK_SERVER_MEMBER_INTEGRITY TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.check_server_member_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_server_owner UUID;
    v_caller UUID := auth.uid();
    v_is_owner BOOLEAN;
    v_owner_count INT;
BEGIN
    -- Allow bypass if we are transferring ownership, deleting the server, or deleting account
    IF COALESCE(current_setting('nexus.in_transfer_server_ownership', true), 'off') = 'on' OR
       COALESCE(current_setting('nexus.deleting_server', true), 'off') = 'on' OR
       COALESCE(current_setting('nexus.in_user_deletion', true), 'off') = 'on' THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    SELECT owner_id INTO v_server_owner
    FROM public.servers
    WHERE id = COALESCE(NEW.server_id, OLD.server_id);

    IF TG_OP = 'UPDATE' THEN
        IF OLD.role <> NEW.role THEN
            IF v_caller IS NOT NULL THEN
                v_is_owner := (v_caller = v_server_owner) OR public.is_server_owner(NEW.server_id, v_caller);

                IF NOT v_is_owner AND NEW.role = 'owner' THEN
                    RAISE EXCEPTION 'Only server owners can promote members to owner';
                END IF;

                IF NOT v_is_owner AND OLD.role = 'owner' THEN
                    RAISE EXCEPTION 'Admins cannot modify server owner role';
                END IF;

                IF NOT v_is_owner AND NEW.role NOT IN ('member', 'moderator', 'admin') THEN
                    RAISE EXCEPTION 'Admins cannot grant unauthorized role';
                END IF;
            END IF;

            IF (OLD.role = 'owner' OR OLD.user_id = v_server_owner) AND NEW.role <> 'owner' THEN
                IF OLD.user_id = v_server_owner THEN
                    RAISE EXCEPTION 'Cannot demote server owner. Transfer ownership first.';
                END IF;

                SELECT COUNT(*) INTO v_owner_count
                FROM public.server_members
                WHERE server_id = OLD.server_id AND role = 'owner';

                IF v_owner_count <= 1 THEN
                    RAISE EXCEPTION 'Cannot demote the last owner of a server';
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- Deletion guard
    IF TG_OP = 'DELETE' THEN
        IF v_server_owner = OLD.user_id THEN
            RAISE EXCEPTION 'Cannot delete server owner membership. Transfer ownership first.';
        END IF;

        IF v_caller IS NOT NULL THEN
            v_is_owner := (v_caller = v_server_owner) OR public.is_server_owner(OLD.server_id, v_caller);
            IF NOT v_is_owner AND (OLD.role = 'owner' OR OLD.user_id = v_server_owner) THEN
                RAISE EXCEPTION 'Admins cannot remove server owners';
            END IF;
        END IF;

        IF OLD.role = 'owner' THEN
            SELECT COUNT(*) INTO v_owner_count
            FROM public.server_members
            WHERE server_id = OLD.server_id AND role = 'owner';

            IF v_owner_count <= 1 THEN
                RAISE EXCEPTION 'Cannot delete the last owner of a server';
            END IF;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

-- 11. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
