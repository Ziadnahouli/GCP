-- ==============================================================================
-- Migration: 00024_server_invite_race_condition_and_csprng.sql
-- Description: Phase A5 Remediation: Fix Server Join Race Condition & CSPRNG Entropy
--   1. Lock invite row with FOR UPDATE and use atomic UPDATE ... WHERE uses < max_uses.
--   2. Generate invite codes using gen_random_uuid() (>= 64 bits CSPRNG entropy).
-- ==============================================================================

-- 1. Atomic join_server_with_invite with row locking
DROP FUNCTION IF EXISTS public.join_server_with_invite(TEXT);
CREATE OR REPLACE FUNCTION public.join_server_with_invite(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_id UUID := auth.uid();
    inv RECORD;
    v_server_id UUID;
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Row lock using FOR UPDATE to prevent race condition across concurrent joins
    SELECT * INTO inv
    FROM public.server_invites
    WHERE code = trim(p_code)
    FOR UPDATE;

    IF inv.id IS NULL THEN
        RAISE EXCEPTION 'Invalid invite code';
    END IF;

    IF inv.is_revoked THEN
        RAISE EXCEPTION 'Invite code has been revoked';
    END IF;

    IF inv.expires_at IS NOT NULL AND inv.expires_at <= NOW() THEN
        RAISE EXCEPTION 'Invite code has expired';
    END IF;

    IF inv.max_uses > 0 AND inv.uses >= inv.max_uses THEN
        RAISE EXCEPTION 'Invite code has reached its maximum uses';
    END IF;

    v_server_id := inv.server_id;

    IF EXISTS (
        SELECT 1 FROM public.server_bans
        WHERE server_id = v_server_id AND user_id = caller_id
    ) THEN
        RAISE EXCEPTION 'You are banned from this server';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.server_members
        WHERE server_id = v_server_id AND user_id = caller_id
    ) THEN
        -- Atomic increment with conditional guard
        UPDATE public.server_invites
        SET uses = uses + 1
        WHERE id = inv.id AND (max_uses = 0 OR uses < max_uses);

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invite code has reached its maximum uses';
        END IF;

        INSERT INTO public.server_members (server_id, user_id, role)
        VALUES (v_server_id, caller_id, 'member');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'server_id', v_server_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_server_with_invite(TEXT) TO authenticated;

-- 2. Hardened create_server_invite using CSPRNG with >= 64 bits of entropy
DROP FUNCTION IF EXISTS public.create_server_invite(UUID, INT, INT);
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
    v_code TEXT;
    v_expires_at TIMESTAMPTZ;
    v_invite_id UUID;
BEGIN
    IF NOT public.is_server_owner_or_admin(p_server_id, auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient permissions to create server invites';
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
        p_server_id, v_code, auth.uid(), COALESCE(p_max_uses, 0), v_expires_at
    )
    RETURNING id INTO v_invite_id;

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
