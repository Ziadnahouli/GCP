-- ==============================================================================
-- Migration: 00031_server_ownership_and_security_hardening.sql
-- Description: SS-S1 Server Ownership Protection, Immutable Server Columns,
--              and Server Metadata Length/Format Constraints
-- ==============================================================================

-- 1. SERVER METADATA LENGTH & FORMAT CONSTRAINTS
ALTER TABLE public.servers DROP CONSTRAINT IF EXISTS servers_name_length_check;
ALTER TABLE public.servers ADD CONSTRAINT servers_name_length_check
    CHECK (length(btrim(name)) >= 1 AND length(btrim(name)) <= 100);

ALTER TABLE public.servers DROP CONSTRAINT IF EXISTS servers_description_length_check;
ALTER TABLE public.servers ADD CONSTRAINT servers_description_length_check
    CHECK (description IS NULL OR length(description) <= 1000);

ALTER TABLE public.servers DROP CONSTRAINT IF EXISTS servers_icon_url_length_check;
ALTER TABLE public.servers ADD CONSTRAINT servers_icon_url_length_check
    CHECK (icon_url IS NULL OR length(icon_url) <= 2048);

-- 2. TRIGGER: PREVENT MUTATION OF IMMUTABLE SERVER COLUMNS
-- Protects id, created_at, and owner_id from unauthorized in-place updates.
-- owner_id can only be transferred via transfer_server_ownership() which sets
-- nexus.in_transfer_server_ownership = 'on'.
CREATE OR REPLACE FUNCTION public.trg_servers_immutable_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.id <> NEW.id THEN
        RAISE EXCEPTION 'servers.id is immutable';
    END IF;

    IF OLD.created_at <> NEW.created_at THEN
        RAISE EXCEPTION 'servers.created_at is immutable';
    END IF;

    IF OLD.owner_id <> NEW.owner_id THEN
        IF COALESCE(current_setting('nexus.in_transfer_server_ownership', true), 'off') <> 'on' THEN
            RAISE EXCEPTION 'servers.owner_id is immutable. Use transfer_server_ownership() to transfer ownership.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_servers_immutable_columns ON public.servers;
CREATE TRIGGER trg_servers_immutable_columns
    BEFORE UPDATE ON public.servers
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_servers_immutable_columns();

-- 3. HARDEN RLS FOR SERVERS UPDATE (WITH CHECK ENFORCEMENT)
DROP POLICY IF EXISTS "Owners and admins can update servers" ON public.servers;
CREATE POLICY "Owners and admins can update servers"
    ON public.servers FOR UPDATE
    USING (
        owner_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.server_members sm
            WHERE sm.server_id = servers.id AND sm.user_id = auth.uid() AND sm.role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        owner_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.server_members sm
            WHERE sm.server_id = servers.id AND sm.user_id = auth.uid() AND sm.role IN ('owner', 'admin')
        )
    );

