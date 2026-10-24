-- ==============================================================================
-- Migration: 00018_deep_audit_security_and_state_fixes.sql
-- Description: Deep Audit Security & State Integrity Hardening
--   1. Finding A: Lock down user_settings RLS. Strictly restrict user_settings
--      to auth.uid() = user_id. Expose communication privacy via view & RPC only.
--   2. Finding H: Server member authorization hardening.
--      - Enforce immutable user_id and server_id on server_members UPDATE.
--      - Atomic transfer_server_ownership function synchronizing servers.owner_id and server_members.role.
--      - Prevent inconsistent ownership states, orphan servers, and unauthorized role tampering.
-- ==============================================================================

-- 1. USER SETTINGS PRIVACY HARDENING (Finding A)
DROP POLICY IF EXISTS "Anyone can view user communication privacy" ON public.user_settings;
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;

CREATE POLICY "Users can view their own settings"
    ON public.user_settings FOR SELECT
    USING (auth.uid() = user_id);

-- Provide a secure, narrowly-scoped public view for communication privacy
CREATE OR REPLACE VIEW public.user_communication_privacy AS
SELECT 
    user_id,
    allow_direct_messages,
    allow_friend_requests
FROM public.user_settings;

GRANT SELECT ON public.user_communication_privacy TO authenticated, anon;

-- Ensure get_user_dm_policy RPC safely reads without exposing other columns
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


-- 2. SERVER ROLE AUTHORIZATION & OWNERSHIP HARDENING (Finding H)

-- Enforce strict UPDATE policy on server_members:
-- - Immutable foreign keys (server_id and user_id cannot be changed)
-- - Non-owners cannot touch owner or admin rows
-- - Non-owners cannot self-escalate or appoint admins/owners
DROP POLICY IF EXISTS "Owners and admins can update member roles" ON public.server_members;

CREATE POLICY "Owners and admins can update member roles"
    ON public.server_members FOR UPDATE
    USING (
        -- Caller must be owner or admin of the server
        public.is_server_owner_or_admin(server_id, auth.uid()) AND
        -- A non-owner cannot touch the server owner's membership row
        (
            public.is_server_owner(server_id, auth.uid()) OR
            NOT public.is_server_owner(server_id, server_members.user_id)
        ) AND
        -- A non-owner cannot update their own membership row (prevents self-escalation)
        (
            public.is_server_owner(server_id, auth.uid()) OR
            server_members.user_id <> auth.uid()
        ) AND
        -- A non-owner cannot modify the role of an existing admin
        (
            public.is_server_owner(server_id, auth.uid()) OR
            server_members.role NOT IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        -- Enforce immutable foreign keys
        server_id = server_members.server_id AND
        user_id = server_members.user_id AND
        -- Enforce valid role values
        role IN ('owner', 'admin', 'moderator', 'member') AND
        -- Server owner can assign valid roles
        (
            public.is_server_owner(server_id, auth.uid()) OR
            -- Non-owner admins:
            (
                public.is_server_owner_or_admin(server_id, auth.uid()) AND
                -- Cannot assign 'owner' or 'admin'
                role IN ('member', 'moderator') AND
                server_members.user_id <> auth.uid() AND
                NOT public.is_server_owner(server_id, server_members.user_id)
            )
        )
    );

-- Atomic server ownership transfer RPC
CREATE OR REPLACE FUNCTION public.transfer_server_ownership(
    p_server_id UUID,
    p_new_owner_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_current_owner_id UUID;
    v_is_target_member BOOLEAN;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to transfer server ownership';
    END IF;

    -- Verify caller is the authoritative server owner
    SELECT owner_id INTO v_current_owner_id
    FROM public.servers
    WHERE id = p_server_id;

    IF v_current_owner_id IS NULL THEN
        RAISE EXCEPTION 'Server not found';
    END IF;

    IF v_current_owner_id <> v_caller_id THEN
        RAISE EXCEPTION 'Only the authoritative server owner can transfer ownership';
    END IF;

    IF p_new_owner_id = v_caller_id THEN
        -- Already owner
        RETURN TRUE;
    END IF;

    -- Verify target is a member of the server
    SELECT EXISTS (
        SELECT 1 FROM public.server_members
        WHERE server_id = p_server_id AND user_id = p_new_owner_id
    ) INTO v_is_target_member;

    IF NOT v_is_target_member THEN
        RAISE EXCEPTION 'Target user must be a member of the server to receive ownership';
    END IF;

    -- Atomically update servers.owner_id
    UPDATE public.servers
    SET owner_id = p_new_owner_id
    WHERE id = p_server_id;

    -- Update target member role to 'owner'
    UPDATE public.server_members
    SET role = 'owner'
    WHERE server_id = p_server_id AND user_id = p_new_owner_id;

    -- Demote old owner to 'admin'
    UPDATE public.server_members
    SET role = 'admin'
    WHERE server_id = p_server_id AND user_id = v_caller_id;

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_server_admin(p_server_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = p_server_id AND user_id = p_user_id AND role = 'admin'
  );
$$;

-- Protect server ownership consistency and role hierarchy via trigger
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
    v_is_admin BOOLEAN;
    v_owner_count INT;
BEGIN
    SELECT owner_id INTO v_server_owner FROM public.servers WHERE id = OLD.server_id;

    IF TG_OP = 'UPDATE' THEN
        -- Prevent altering primary foreign keys on update
        IF NEW.server_id <> OLD.server_id THEN
            RAISE EXCEPTION 'Cannot transfer membership to a different server';
        END IF;
        IF NEW.user_id <> OLD.user_id THEN
            RAISE EXCEPTION 'Cannot transfer membership to a different user';
        END IF;

        IF NEW.role IS DISTINCT FROM OLD.role THEN
            IF v_caller IS NOT NULL THEN
                v_is_owner := (v_caller = v_server_owner) OR public.is_server_owner(OLD.server_id, v_caller);
                v_is_admin := public.is_server_admin(OLD.server_id, v_caller);

                -- Caller must be owner or admin
                IF NOT (v_is_owner OR v_is_admin) THEN
                    RAISE EXCEPTION 'Only server owners or admins can modify member roles';
                END IF;

                -- Admins cannot change their own role
                IF NOT v_is_owner AND v_caller = OLD.user_id THEN
                    RAISE EXCEPTION 'Admins cannot change their own role';
                END IF;

                -- Admins cannot modify an owner's role
                IF NOT v_is_owner AND (OLD.role = 'owner' OR OLD.user_id = v_server_owner) THEN
                    RAISE EXCEPTION 'Admins cannot modify owner roles';
                END IF;

                -- Only owner can grant owner role
                IF NEW.role = 'owner' AND NOT v_is_owner THEN
                    RAISE EXCEPTION 'Only server owner can grant owner role';
                END IF;

                -- Admins can only assign member or moderator
                IF NOT v_is_owner AND NEW.role NOT IN ('member', 'moderator', 'admin') THEN
                    RAISE EXCEPTION 'Admins cannot grant unauthorized role';
                END IF;
            END IF;

            -- The server owner or last owner cannot be demoted
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

    -- Prevent deleting the server owner's membership or the last owner
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

DROP TRIGGER IF EXISTS trg_server_member_integrity ON public.server_members;
CREATE TRIGGER trg_server_member_integrity
    BEFORE UPDATE OR DELETE ON public.server_members
    FOR EACH ROW
    EXECUTE FUNCTION public.check_server_member_integrity();
