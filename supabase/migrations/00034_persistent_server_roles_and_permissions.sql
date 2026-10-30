-- ==============================================================================
-- Migration: 00034_persistent_server_roles_and_permissions.sql
-- Description: SS-R1, SS-R2, SS-R3: Database-backed Persistent Server Roles,
--              Permissions Evaluation Matrix, Hierarchy Enforcement, and Role RPCs
-- ==============================================================================

-- 1. SERVER ROLES TABLE
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_server_roles_unique_name ON public.server_roles (server_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_server_roles_server ON public.server_roles(server_id, position DESC);
ALTER TABLE public.server_roles ENABLE ROW LEVEL SECURITY;

-- 2. SERVER MEMBERS ROLE_ID FK
ALTER TABLE public.server_members
    ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.server_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_server_members_role_id ON public.server_members(role_id);

-- 3. SEED DEFAULT ROLES HELPER
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
    -- Admin role (position 3)
    INSERT INTO public.server_roles (server_id, name, color, position, permissions, is_system)
    VALUES (
        p_server_id,
        'Admin',
        '#ef4444',
        3,
        ARRAY[
            'manage_server', 'manage_channels', 'manage_roles', 'manage_invites', 'create_invites',
            'kick_members', 'ban_members', 'moderate_members', 'manage_messages', 'manage_reports',
            'view_audit_log', 'send_messages', 'send_attachments', 'mention_everyone',
            'connect_voice', 'speak_voice', 'share_screen', 'use_soundboard'
        ],
        TRUE
    )
    ON CONFLICT (server_id, lower(name))
    DO UPDATE SET is_system = TRUE, position = 3
    RETURNING id INTO v_admin_id;

    -- Moderator role (position 2)
    INSERT INTO public.server_roles (server_id, name, color, position, permissions, is_system)
    VALUES (
        p_server_id,
        'Moderator',
        '#3b82f6',
        2,
        ARRAY[
            'manage_channels', 'create_invites', 'kick_members', 'moderate_members',
            'manage_messages', 'manage_reports', 'view_audit_log', 'send_messages',
            'send_attachments', 'mention_everyone', 'connect_voice', 'speak_voice',
            'share_screen', 'use_soundboard'
        ],
        TRUE
    )
    ON CONFLICT (server_id, lower(name))
    DO UPDATE SET is_system = TRUE, position = 2
    RETURNING id INTO v_mod_id;

    -- Member role (position 1)
    INSERT INTO public.server_roles (server_id, name, color, position, permissions, is_system)
    VALUES (
        p_server_id,
        'Member',
        '#94a3b8',
        1,
        ARRAY[
            'create_invites', 'send_messages', 'send_attachments',
            'connect_voice', 'speak_voice', 'share_screen', 'use_soundboard'
        ],
        TRUE
    )
    ON CONFLICT (server_id, lower(name))
    DO UPDATE SET is_system = TRUE, position = 1
    RETURNING id INTO v_member_id;
END;
$$;

-- 4. TRIGGER: AUTO-SEED DEFAULT ROLES ON SERVER CREATION
CREATE OR REPLACE FUNCTION public.trg_seed_server_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.seed_default_server_roles(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_server_roles ON public.servers;
CREATE TRIGGER trg_seed_server_roles
    AFTER INSERT ON public.servers
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_seed_server_roles();

-- Backfill existing servers and existing member role_ids
DO $$
DECLARE
    srv RECORD;
BEGIN
    FOR srv IN SELECT id FROM public.servers LOOP
        PERFORM public.seed_default_server_roles(srv.id);
    END LOOP;

    UPDATE public.server_members sm
    SET role_id = sr.id
    FROM public.server_roles sr
    WHERE sm.server_id = sr.server_id
      AND (
        (sm.role = 'owner' AND lower(sr.name) = 'admin') OR
        (sm.role = 'admin' AND lower(sr.name) = 'admin') OR
        (sm.role = 'moderator' AND lower(sr.name) = 'moderator') OR
        (sm.role = 'member' AND lower(sr.name) = 'member')
      )
      AND sm.role_id IS NULL;
END $$;

-- 5. THE SOURCE OF TRUTH: HAS_SERVER_PERMISSION
DROP FUNCTION IF EXISTS public.has_server_permission(UUID, UUID, TEXT);
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
    v_is_owner BOOLEAN;
    v_role_id UUID;
    v_timeout_until TIMESTAMPTZ;
    v_has_perm BOOLEAN := FALSE;
BEGIN
    IF p_server_id IS NULL OR p_user_id IS NULL OR p_permission IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Server owner has all permissions unconditionally
    SELECT (owner_id = p_user_id) INTO v_is_owner
    FROM public.servers
    WHERE id = p_server_id;

    IF v_is_owner THEN
        RETURN TRUE;
    END IF;

    -- Lookup member and timeout
    SELECT role_id, timeout_until
    INTO v_role_id, v_timeout_until
    FROM public.server_members
    WHERE server_id = p_server_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Timed out members are blocked from speaking and posting
    IF v_timeout_until IS NOT NULL AND v_timeout_until > NOW() THEN
        IF p_permission IN (
            'send_messages', 'send_attachments', 'mention_everyone',
            'speak_voice', 'share_screen', 'use_soundboard'
        ) THEN
            RETURN FALSE;
        END IF;
    END IF;

    -- Fallback: if role_id is null, resolve role_id from default Member role
    IF v_role_id IS NULL THEN
        SELECT id INTO v_role_id
        FROM public.server_roles
        WHERE server_id = p_server_id AND name = 'Member'
        LIMIT 1;
    END IF;

    IF v_role_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT (p_permission = ANY(permissions)) INTO v_has_perm
    FROM public.server_roles
    WHERE id = v_role_id;

    RETURN COALESCE(v_has_perm, FALSE);
END;
$$;

-- 6. POLICIES ON SERVER_ROLES
CREATE POLICY "Server members can view roles"
    ON public.server_roles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.server_members sm
            WHERE sm.server_id = server_roles.server_id AND sm.user_id = auth.uid()
        ) OR EXISTS (
            SELECT 1 FROM public.servers s
            WHERE s.id = server_roles.server_id AND s.owner_id = auth.uid()
        )
    );

-- 7. ROLE MANAGEMENT RPCS
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

        -- Position must be strictly below caller's position
        v_new_pos := GREATEST(1, v_caller_role_pos - 1);
    ELSE
        -- Owner creates roles right below Admin (e.g. pos 2)
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

CREATE OR REPLACE FUNCTION public.update_server_role(
    p_role_id UUID,
    p_name TEXT DEFAULT NULL,
    p_color TEXT DEFAULT NULL,
    p_permissions TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_server_id UUID;
    v_is_system BOOLEAN;
    v_role_pos INT;
    v_caller_pos INT := 0;
    v_is_owner BOOLEAN;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required to update roles';
    END IF;

    SELECT server_id, is_system, position
    INTO v_server_id, v_is_system, v_role_pos
    FROM public.server_roles
    WHERE id = p_role_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found';
    END IF;

    IF NOT public.has_server_permission(v_server_id, v_caller, 'manage_roles') THEN
        RAISE EXCEPTION 'Insufficient permissions to update roles';
    END IF;

    v_is_owner := public.is_server_owner(v_server_id, v_caller);

    IF NOT v_is_owner THEN
        SELECT COALESCE(sr.position, 1) INTO v_caller_pos
        FROM public.server_members sm
        LEFT JOIN public.server_roles sr ON sm.role_id = sr.id
        WHERE sm.server_id = v_server_id AND sm.user_id = v_caller;

        IF v_caller_pos <= v_role_pos THEN
            RAISE EXCEPTION 'Cannot edit role with equal or higher position than your highest role';
        END IF;
    END IF;

    -- System roles: name cannot be modified
    IF v_is_system AND p_name IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot rename built-in system roles';
    END IF;

    UPDATE public.server_roles
    SET name = COALESCE(btrim(p_name), name),
        color = COALESCE(p_color, color),
        permissions = COALESCE(p_permissions, permissions)
    WHERE id = p_role_id;

    PERFORM public.log_moderation_audit(
        v_server_id,
        NULL,
        'update_role',
        'Updated role',
        jsonb_build_object('role_id', p_role_id, 'permissions', p_permissions)
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_server_role(
    p_role_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_server_id UUID;
    v_is_system BOOLEAN;
    v_role_name TEXT;
    v_role_pos INT;
    v_caller_pos INT := 0;
    v_is_owner BOOLEAN;
    v_member_role_id UUID;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required to delete roles';
    END IF;

    SELECT server_id, is_system, name, position
    INTO v_server_id, v_is_system, v_role_name, v_role_pos
    FROM public.server_roles
    WHERE id = p_role_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found';
    END IF;

    IF v_is_system THEN
        RAISE EXCEPTION 'Cannot delete built-in system roles';
    END IF;

    IF NOT public.has_server_permission(v_server_id, v_caller, 'manage_roles') THEN
        RAISE EXCEPTION 'Insufficient permissions to delete roles';
    END IF;

    v_is_owner := public.is_server_owner(v_server_id, v_caller);

    IF NOT v_is_owner THEN
        SELECT COALESCE(sr.position, 1) INTO v_caller_pos
        FROM public.server_members sm
        LEFT JOIN public.server_roles sr ON sm.role_id = sr.id
        WHERE sm.server_id = v_server_id AND sm.user_id = v_caller;

        IF v_caller_pos <= v_role_pos THEN
            RAISE EXCEPTION 'Cannot delete role with equal or higher position than your highest role';
        END IF;
    END IF;

    -- Lookup default Member role for this server
    SELECT id INTO v_member_role_id
    FROM public.server_roles
    WHERE server_id = v_server_id AND name = 'Member'
    LIMIT 1;

    -- Reassign members holding this role to Member in the same transaction
    UPDATE public.server_members
    SET role_id = v_member_role_id,
        role = 'member'
    WHERE server_id = v_server_id AND role_id = p_role_id;

    DELETE FROM public.server_roles
    WHERE id = p_role_id;

    PERFORM public.log_moderation_audit(
        v_server_id,
        NULL,
        'delete_role',
        'Deleted role ' || v_role_name,
        jsonb_build_object('role_id', p_role_id, 'name', v_role_name)
    );

    RETURN TRUE;
END;
$$;

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

    -- Validate target is a member of this server
    IF NOT EXISTS (
        SELECT 1 FROM public.server_members
        WHERE server_id = p_server_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Target user is not a member of this server';
    END IF;

    -- Validate role belongs to this server
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

        -- Caller cannot grant a role at or above their own rank
        IF v_caller_pos <= v_role_pos THEN
            RAISE EXCEPTION 'Cannot grant role with equal or higher rank than your own';
        END IF;

        -- Caller cannot modify a member whose current rank is equal or higher
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

-- 8. REALTIME PUBLICATION
ALTER TABLE public.server_roles REPLICA IDENTITY FULL;
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.server_roles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
