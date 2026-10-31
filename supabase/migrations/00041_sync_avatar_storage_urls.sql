-- ==============================================================================
-- Migration: 00041_sync_avatar_storage_urls.sql
-- Description:
--   1. Automatically synchronizes public.profiles.avatar_url whenever avatar_path changes.
--   2. Automatically synchronizes public.profiles.banner_url whenever banner_path changes.
--   3. One-time update to backfill existing profiles with their public storage URLs.
--   4. Reload PostgREST schema cache.
-- ==============================================================================

-- 1. Sync trigger function
CREATE OR REPLACE FUNCTION public.sync_profile_storage_urls()
RETURNS TRIGGER AS $$
BEGIN
    -- Synchronize avatar_url with avatar_path if relative storage path is present
    IF NEW.avatar_path IS NOT NULL AND NEW.avatar_path <> '' THEN
        IF NEW.avatar_url IS NULL OR NEW.avatar_url = '' OR NEW.avatar_url LIKE '%/storage/v1/object/public/avatars/%' THEN
            NEW.avatar_url := '/storage/v1/object/public/avatars/' || NEW.avatar_path;
        END IF;
    ELSIF NEW.avatar_path IS NULL THEN
        IF NEW.avatar_url LIKE '%/storage/v1/object/public/avatars/%' THEN
            NEW.avatar_url := NULL;
        END IF;
    END IF;

    -- Synchronize banner_url with banner_path if relative storage path is present
    IF NEW.banner_path IS NOT NULL AND NEW.banner_path <> '' THEN
        IF NEW.banner_url IS NULL OR NEW.banner_url = '' OR NEW.banner_url LIKE '%/storage/v1/object/public/avatars/%' THEN
            NEW.banner_url := '/storage/v1/object/public/avatars/' || NEW.banner_path;
        END IF;
    ELSIF NEW.banner_path IS NULL THEN
        IF NEW.banner_url LIKE '%/storage/v1/object/public/avatars/%' THEN
            NEW.banner_url := NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_profile_storage_urls ON public.profiles;
CREATE TRIGGER trigger_sync_profile_storage_urls
    BEFORE INSERT OR UPDATE OF avatar_path, banner_path ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_profile_storage_urls();

-- 2. Backfill existing profiles
UPDATE public.profiles
SET avatar_url = '/storage/v1/object/public/avatars/' || avatar_path
WHERE avatar_path IS NOT NULL AND avatar_path <> '' AND (avatar_url IS NULL OR avatar_url = '' OR avatar_url NOT LIKE '%/storage/v1/object/public/avatars/%');

UPDATE public.profiles
SET banner_url = '/storage/v1/object/public/avatars/' || banner_path
WHERE banner_path IS NOT NULL AND banner_path <> '' AND (banner_url IS NULL OR banner_url = '' OR banner_url NOT LIKE '%/storage/v1/object/public/avatars/%');

-- 3. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

