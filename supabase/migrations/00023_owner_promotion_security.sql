-- ==============================================================================
-- Migration: 00023_owner_promotion_security.sql
-- Description: Phase A4 Remediation: Admin Self-Promotion and Owner Protection
--   1. Only current owner can transfer ownership or grant owner role.
--   2. Admins may change role between member and admin for non-owners, but NEVER change their own role.
--   3. The last owner cannot be demoted or removed (both conversation_members & server_members).
-- ==============================================================================

-- 1. Conversation Ownership & Admin Helpers
CREATE OR REPLACE FUNCTION public.is_conversation_owner(p_conv_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conv_id AND created_by = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = p_conv_id AND user_id = p_user_id AND role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_admin(p_conv_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = p_conv_id AND user_id = p_user_id AND role = 'admin'
  );
$$;

-- 2. Storage Objects RLS Enforcement (RLS is enabled by default on hosted Supabase, catch permission error if not table owner)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        BEGIN
            ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
        EXCEPTION
            WHEN OTHERS THEN
                NULL;
        END;
    END IF;
END $$;

-- 3. Server Admin Helper
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

-- 3. Conversation Members Immutability & Role Escalation Hardening
CREATE OR REPLACE FUNCTION public.trg_conversation_members_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_is_owner BOOLEAN;
    v_is_admin BOOLEAN;
    v_owner_count INT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id <> OLD.id THEN
            RAISE EXCEPTION 'conversation_members.id is immutable';
        END IF;
        IF NEW.conversation_id <> OLD.conversation_id THEN
            RAISE EXCEPTION 'conversation_members.conversation_id is immutable';
        END IF;
        IF NEW.user_id <> OLD.user_id THEN
            RAISE EXCEPTION 'conversation_members.user_id is immutable';
        END IF;

        IF NEW.role IS DISTINCT FROM OLD.role THEN
            IF v_caller IS NOT NULL THEN
                v_is_owner := public.is_conversation_owner(OLD.conversation_id, v_caller);
                v_is_admin := public.is_conversation_admin(OLD.conversation_id, v_caller);

                -- Caller must be owner or admin
                IF NOT (v_is_owner OR v_is_admin) THEN
                    RAISE EXCEPTION 'Only conversation owners or admins can modify member roles';
                END IF;

                -- Admins cannot change their own role
                IF NOT v_is_owner AND v_caller = OLD.user_id THEN
                    RAISE EXCEPTION 'Admins cannot change their own role';
                END IF;

                -- Admins cannot modify owner roles
                IF NOT v_is_owner AND OLD.role = 'owner' THEN
                    RAISE EXCEPTION 'Admins cannot modify owner roles';
                END IF;

                -- Only owner can grant owner role
                IF NEW.role = 'owner' AND NOT v_is_owner THEN
                    RAISE EXCEPTION 'Only conversation owner can grant owner role';
                END IF;

                -- Admins can only change role between member and admin
                IF NOT v_is_owner AND NEW.role NOT IN ('member', 'admin') THEN
                    RAISE EXCEPTION 'Admins can only change role between member and admin';
                END IF;
            END IF;

            -- The last owner cannot be demoted
            IF OLD.role = 'owner' AND NEW.role <> 'owner' THEN
                SELECT COUNT(*) INTO v_owner_count
                FROM public.conversation_members
                WHERE conversation_id = OLD.conversation_id AND role = 'owner';

                IF v_owner_count <= 1 THEN
                    RAISE EXCEPTION 'Cannot demote the last owner of a conversation';
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF v_caller IS NOT NULL THEN
            v_is_owner := public.is_conversation_owner(OLD.conversation_id, v_caller);
            IF NOT v_is_owner AND OLD.role = 'owner' THEN
                RAISE EXCEPTION 'Admins cannot remove conversation owners';
            END IF;
        END IF;

        -- Protect last owner from removal / self-leave
        IF OLD.role = 'owner' THEN
            SELECT COUNT(*) INTO v_owner_count
            FROM public.conversation_members
            WHERE conversation_id = OLD.conversation_id AND role = 'owner';

            IF v_owner_count <= 1 THEN
                RAISE EXCEPTION 'Cannot remove the last owner of a conversation';
            END IF;
        END IF;

        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_members_immutability ON public.conversation_members;
CREATE TRIGGER trg_conversation_members_immutability
    BEFORE UPDATE OR DELETE ON public.conversation_members
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_conversation_members_immutability();

-- 4. Server Members Immutability & Role Escalation Hardening
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
