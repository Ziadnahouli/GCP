-- ==============================================================================
-- Migration: 00035_channel_reorder_and_invite_hardening.sql
-- Description: SS-C2 Reorder channels RPC, SS-I5 Create invites permission,
--              rate limiting, and audit logging
-- ==============================================================================

-- 1. REORDER CHANNELS RPC
DROP FUNCTION IF EXISTS public.reorder_channels(UUID, UUID[]);
CREATE OR REPLACE FUNCTION public.reorder_channels(
    p_server_id UUID,
    p_ordered_ids UUID[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_id UUID;
    v_pos INT := 0;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required to reorder channels';
    END IF;

    IF NOT public.has_server_permission(p_server_id, v_caller, 'manage_channels') THEN
        RAISE EXCEPTION 'Insufficient permissions to reorder channels';
    END IF;

    FOREACH v_id IN ARRAY p_ordered_ids LOOP
        UPDATE public.channels
        SET position = v_pos
        WHERE id = v_id AND server_id = p_server_id;

        v_pos := v_pos + 1;
    END LOOP;

    PERFORM public.log_moderation_audit(
        p_server_id,
        NULL,
        'reorder_channels',
        'Reordered channels',
        jsonb_build_object('ordered_ids', p_ordered_ids)
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_channels(UUID, UUID[]) TO authenticated;

-- 2. HARDEN CREATE_SERVER_INVITE (PERMISSION, RATE LIMITING, AND AUDIT)
DROP FUNCTION IF EXISTS public.create_server_invite(UUID, INT, INT);
DROP FUNCTION IF EXISTS public.create_server_invite(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.create_server_invite(UUID);
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
    v_code TEXT;
    v_expires_at TIMESTAMPTZ;
    v_invite_id UUID;
    v_hourly_count INT;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create server invites';
    END IF;

    IF NOT public.has_server_permission(p_server_id, v_caller, 'create_invites') THEN
        RAISE EXCEPTION 'Insufficient permissions to create server invites';
    END IF;

    -- Rate limit: At most 10 invites per user per hour per server
    SELECT count(*) INTO v_hourly_count
    FROM public.server_invites
    WHERE server_id = p_server_id
      AND created_by = v_caller
      AND created_at > NOW() - INTERVAL '1 hour';

    IF v_hourly_count >= 10 THEN
        RAISE EXCEPTION 'Rate limit exceeded: You cannot create more than 10 invites per hour';
    END IF;

    -- Generate a cryptographically secure 16-hex character invite code (64 bits CSPRNG entropy)
    v_code := SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 16);

    IF p_expires_in_hours > 0 THEN
        v_expires_at := NOW() + (p_expires_in_hours * INTERVAL '1 hour');
    ELSE
        v_expires_at := NULL;
    END IF;

    INSERT INTO public.server_invites (
        server_id, code, created_by, max_uses, expires_at
    )
    VALUES (
        p_server_id, v_code, v_caller, COALESCE(p_max_uses, 0), v_expires_at
    )
    RETURNING id INTO v_invite_id;

    -- Audit log creation
    PERFORM public.log_moderation_audit(
        p_server_id,
        NULL,
        'create_invite',
        'Created server invite',
        jsonb_build_object(
            'invite_id', v_invite_id,
            'code', v_code,
            'max_uses', p_max_uses,
            'expires_at', v_expires_at
        )
    );

    RETURN jsonb_build_object(
        'id', v_invite_id,
        'code', v_code,
        'server_id', p_server_id,
        'max_uses', p_max_uses,
        'expires_at', v_expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_server_invite(UUID, INT, INT) TO authenticated;

