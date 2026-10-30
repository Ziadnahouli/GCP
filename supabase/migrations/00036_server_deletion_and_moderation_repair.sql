-- ==============================================================================
-- Migration: 00036_server_deletion_and_moderation_repair.sql
-- Description: Fix server deletion trigger lock, add delete_server RPC,
--              restore member role_id on unban, and storage RLS for server icons.
-- ==============================================================================

-- 1. UPDATE CHECK_SERVER_MEMBER_INTEGRITY TO ALLOW SERVER DELETION
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
        -- Allow deletion if the entire server is being deleted via delete_server RPC or system cascade
        IF COALESCE(current_setting('nexus.deleting_server', true), 'off') = 'on' THEN
            RETURN OLD;
        END IF;

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

-- 2. DEDICATED ATOMIC DELETE_SERVER RPC
DROP FUNCTION IF EXISTS public.delete_server(UUID);
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
GRANT EXECUTE ON FUNCTION public.delete_server(UUID) TO authenticated;

-- 3. UNBAN_SERVER_MEMBER: RESTORE SYSTEM MEMBER ROLE_ID
DROP FUNCTION IF EXISTS public.unban_server_member(UUID, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.unban_server_member(UUID, UUID);
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
    v_caller UUID := auth.uid();
    v_member_role_id UUID;
    v_server_name TEXT;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required to unban members';
    END IF;

    IF NOT (public.is_server_owner(p_server_id, v_caller) OR public.has_server_permission(p_server_id, v_caller, 'ban_members')) THEN
        RAISE EXCEPTION 'Insufficient permissions to unban members';
    END IF;

    SELECT name INTO v_server_name FROM public.servers WHERE id = p_server_id;

    DELETE FROM public.server_bans
    WHERE server_id = p_server_id AND user_id = p_user_id;

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
    END IF;

    PERFORM public.log_moderation_audit(
        p_server_id,
        p_user_id,
        'unban',
        'Unbanned & restored membership',
        jsonb_build_object('restored', p_restore_member)
    );

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.unban_server_member(UUID, UUID, BOOLEAN) TO authenticated;

-- 4. STORAGE POLICY: ALLOW AUTHENTICATED UPLOADS TO AVATARS FOR SERVER ICONS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        DROP POLICY IF EXISTS "Authenticated users can upload server icons" ON storage.objects;
        CREATE POLICY "Authenticated users can upload server icons"
            ON storage.objects FOR INSERT
            WITH CHECK (
                bucket_id = 'avatars' AND
                auth.role() = 'authenticated' AND
                (
                    (storage.foldername(name))[1] = auth.uid()::text OR
                    (storage.foldername(name))[1] = 'server-icons'
                )
            );
    END IF;
END $$;

-- 5. BACKFILL ROLE_ID FOR ANY MEMBERS MISSING IT
UPDATE public.server_members sm
SET role_id = sr.id
FROM public.server_roles sr
WHERE sm.server_id = sr.server_id
  AND sr.is_system = true
  AND lower(sr.name) = 'member'
  AND sm.role_id IS NULL;

-- 6. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
