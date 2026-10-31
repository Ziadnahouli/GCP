-- Migration: 00044_authoritative_presence_sessions.sql
-- Description: Authoritative server-side presence sessions, heartbeat RPC, end_session RPC, and privacy-governed get_presence RPC.

-- 1. Add 'invisible' to user_presence_status enum if not already present
DO $$
BEGIN
    ALTER TYPE user_presence_status ADD VALUE IF NOT EXISTS 'invisible';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add status_preference column to profiles (separating preference from live state)
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS status_preference TEXT DEFAULT 'online';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_profiles_status_preference'
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT check_profiles_status_preference
            CHECK (status_preference IN ('online', 'idle', 'dnd', 'invisible', 'offline'));
    END IF;
END $$;

-- Synchronize status and status_preference bidirectionally
CREATE OR REPLACE FUNCTION public.sync_profiles_status_preference()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status AND (NEW.status_preference IS NOT DISTINCT FROM OLD.status_preference OR NEW.status_preference IS NULL) THEN
        NEW.status_preference := NEW.status::text;
    ELSIF NEW.status_preference IS DISTINCT FROM OLD.status_preference THEN
        IF NEW.status_preference IN ('online', 'idle', 'dnd', 'offline') THEN
            NEW.status := NEW.status_preference::user_presence_status;
        ELSIF NEW.status_preference = 'invisible' THEN
            NEW.status := 'offline'::user_presence_status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profiles_status_preference ON public.profiles;
CREATE TRIGGER trg_sync_profiles_status_preference
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_profiles_status_preference();

-- 3. Create table user_presence_sessions
CREATE TABLE IF NOT EXISTS public.user_presence_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device TEXT NOT NULL DEFAULT 'web' CHECK (device IN ('web', 'desktop', 'mobile')),
    status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'idle')),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for heartbeat pruning and presence lookups
CREATE INDEX IF NOT EXISTS idx_user_presence_sessions_user_last_seen
    ON public.user_presence_sessions(user_id, last_seen_at DESC);

-- Enable & force RLS
ALTER TABLE public.user_presence_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presence_sessions FORCE ROW LEVEL SECURITY;

-- RLS Policies: users can only insert, select, update, and delete their own sessions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_presence_sessions'
          AND policyname = 'Users can view their own presence sessions'
    ) THEN
        CREATE POLICY "Users can view their own presence sessions"
            ON public.user_presence_sessions FOR SELECT
            TO authenticated
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_presence_sessions'
          AND policyname = 'Users can insert their own presence sessions'
    ) THEN
        CREATE POLICY "Users can insert their own presence sessions"
            ON public.user_presence_sessions FOR INSERT
            TO authenticated
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_presence_sessions'
          AND policyname = 'Users can update their own presence sessions'
    ) THEN
        CREATE POLICY "Users can update their own presence sessions"
            ON public.user_presence_sessions FOR UPDATE
            TO authenticated
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_presence_sessions'
          AND policyname = 'Users can delete their own presence sessions'
    ) THEN
        CREATE POLICY "Users can delete their own presence sessions"
            ON public.user_presence_sessions FOR DELETE
            TO authenticated
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- 4. RPC heartbeat_presence(p_session_id, p_status, p_device)
CREATE OR REPLACE FUNCTION public.heartbeat_presence(
    p_session_id UUID,
    p_status TEXT DEFAULT 'online',
    p_device TEXT DEFAULT 'web'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_session_id UUID;
    v_status TEXT;
    v_device TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_status := CASE WHEN p_status IN ('online', 'idle') THEN p_status ELSE 'online' END;
    v_device := CASE WHEN p_device IN ('web', 'desktop', 'mobile') THEN p_device ELSE 'web' END;
    v_session_id := COALESCE(p_session_id, gen_random_uuid());

    -- Lazily prune stale sessions older than 24 hours
    DELETE FROM public.user_presence_sessions
    WHERE last_seen_at < (now() - INTERVAL '24 hours');

    -- Upsert the session for the authenticated user
    INSERT INTO public.user_presence_sessions (session_id, user_id, status, device, last_seen_at)
    VALUES (v_session_id, v_user_id, v_status, v_device, now())
    ON CONFLICT (session_id) DO UPDATE SET
        status = EXCLUDED.status,
        device = EXCLUDED.device,
        last_seen_at = now()
    WHERE public.user_presence_sessions.user_id = v_user_id;

    RETURN v_session_id;
END;
$$;

-- 5. RPC end_presence_session(p_session_id)
CREATE OR REPLACE FUNCTION public.end_presence_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL OR p_session_id IS NULL THEN
        RETURN FALSE;
    END IF;

    DELETE FROM public.user_presence_sessions
    WHERE session_id = p_session_id
      AND user_id = v_user_id;

    RETURN TRUE;
END;
$$;

-- 6. RPC get_presence(p_user_ids UUID[])
CREATE OR REPLACE FUNCTION public.get_presence(p_user_ids UUID[])
RETURNS TABLE (
    user_id UUID,
    status TEXT,
    custom_status TEXT,
    custom_status_emoji TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_viewer_id UUID := auth.uid();
    v_ids UUID[];
BEGIN
    IF v_viewer_id IS NULL THEN
        RETURN;
    END IF;

    -- Cap user ids to max 200
    v_ids := p_user_ids[1:200];

    RETURN QUERY
    WITH target_users AS (
        SELECT DISTINCT u_id AS id
        FROM unnest(v_ids) AS u_id
    ),
    live_sessions AS (
        SELECT
            s.user_id,
            -- online beats idle
            CASE
                WHEN bool_or(s.status = 'online') THEN 'online'
                WHEN bool_or(s.status = 'idle') THEN 'idle'
                ELSE 'offline'
            END AS aggregated_live_status
        FROM public.user_presence_sessions s
        WHERE s.user_id = ANY(v_ids)
          AND s.last_seen_at >= (now() - INTERVAL '90 seconds')
        GROUP BY s.user_id
    ),
    privacy_and_profiles AS (
        SELECT
            tu.id AS target_id,
            COALESCE(p.status_preference, p.status::text, 'online') AS status_pref,
            p.custom_status,
            p.custom_status_emoji,
            COALESCE(us.presence_visibility, 'mutual_servers') AS visibility,
            -- Check bidirectional block
            EXISTS (
                SELECT 1 FROM public.blocks b
                WHERE (b.blocker_id = v_viewer_id AND b.blocked_id = tu.id)
                   OR (b.blocker_id = tu.id AND b.blocked_id = v_viewer_id)
            ) AS is_blocked,
            -- Relationship checks
            tu.id = v_viewer_id AS is_self,
            public.users_are_friends(v_viewer_id, tu.id) AS is_friend,
            public.users_share_server(v_viewer_id, tu.id) AS has_mutual_server
        FROM target_users tu
        LEFT JOIN public.profiles p ON p.id = tu.id
        LEFT JOIN public.user_settings us ON us.user_id = tu.id
    )
    SELECT
        pp.target_id AS user_id,
        CASE
            -- Blocked or self-hidden: offline
            WHEN pp.is_blocked THEN 'offline'
            -- Target preference invisible or offline
            WHEN pp.status_pref IN ('invisible', 'offline') THEN 'offline'
            -- Self view always sees their actual status
            WHEN pp.is_self THEN
                CASE
                    WHEN pp.status_pref = 'dnd' THEN 'dnd'
                    ELSE COALESCE(ls.aggregated_live_status, 'offline')
                END
            -- Privacy visibility checks
            WHEN pp.visibility = 'nobody' THEN 'offline'
            WHEN pp.visibility = 'friends' AND NOT pp.is_friend THEN 'offline'
            WHEN pp.visibility = 'mutual_servers' AND NOT (pp.is_friend OR pp.has_mutual_server) THEN 'offline'
            -- DND preference wins if there is an active session
            WHEN pp.status_pref = 'dnd' AND ls.aggregated_live_status IN ('online', 'idle') THEN 'dnd'
            -- Effective live presence
            ELSE COALESCE(ls.aggregated_live_status, 'offline')
        END AS status,
        CASE
            WHEN pp.is_blocked THEN NULL
            WHEN NOT pp.is_self AND pp.visibility = 'nobody' THEN NULL
            WHEN NOT pp.is_self AND pp.visibility = 'friends' AND NOT pp.is_friend THEN NULL
            WHEN NOT pp.is_self AND pp.visibility = 'mutual_servers' AND NOT (pp.is_friend OR pp.has_mutual_server) THEN NULL
            ELSE pp.custom_status
        END AS custom_status,
        CASE
            WHEN pp.is_blocked THEN NULL
            WHEN NOT pp.is_self AND pp.visibility = 'nobody' THEN NULL
            WHEN NOT pp.is_self AND pp.visibility = 'friends' AND NOT pp.is_friend THEN NULL
            WHEN NOT pp.is_self AND pp.visibility = 'mutual_servers' AND NOT (pp.is_friend OR pp.has_mutual_server) THEN NULL
            ELSE pp.custom_status_emoji
        END AS custom_status_emoji
    FROM privacy_and_profiles pp
    LEFT JOIN live_sessions ls ON ls.user_id = pp.target_id;
END;
$$;

-- 7. Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_presence_sessions TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_presence(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_presence_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_presence(UUID[]) TO authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
