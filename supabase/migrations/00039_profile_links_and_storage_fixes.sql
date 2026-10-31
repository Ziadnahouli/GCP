-- ==============================================================================
-- Migration: 00039_profile_links_and_storage_fixes.sql
-- Description:
--   1. Ensure 'banners' bucket exists in storage.buckets with RLS policies.
--   2. Strengthen public.profile_links SELECT RLS policy to respect profile_visibility
--      and mutual relationships, preventing blocked users and strangers from viewing links.
-- ==============================================================================

-- 1. Storage bucket: banners
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'banners',
            'banners',
            true,
            5242880,
            ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
        )
        ON CONFLICT (id) DO UPDATE SET
            public = true,
            file_size_limit = 5242880,
            allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        DROP POLICY IF EXISTS "Authenticated users can upload banners" ON storage.objects;
        CREATE POLICY "Authenticated users can upload banners"
            ON storage.objects FOR INSERT
            TO authenticated
            WITH CHECK (
                bucket_id = 'banners'
                AND auth.uid()::text = (storage.foldername(name))[1]
            );

        DROP POLICY IF EXISTS "Public can view banners" ON storage.objects;
        CREATE POLICY "Public can view banners"
            ON storage.objects FOR SELECT
            TO public
            USING (bucket_id = 'banners');
    END IF;
END $$;

-- 2. Restrict public.profile_links SELECT policy
DROP POLICY IF EXISTS "Public can view permitted profile links" ON public.profile_links;
CREATE POLICY "Public can view permitted profile links"
    ON public.profile_links FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR (
            NOT public.users_are_blocked(auth.uid(), user_id)
            AND (
                COALESCE((SELECT profile_visibility FROM public.user_settings WHERE user_id = profile_links.user_id), 'mutual_servers') = 'everyone'
                OR (
                    COALESCE((SELECT profile_visibility FROM public.user_settings WHERE user_id = profile_links.user_id), 'mutual_servers') = 'friends'
                    AND public.users_are_friends(auth.uid(), user_id)
                )
                OR (
                    COALESCE((SELECT profile_visibility FROM public.user_settings WHERE user_id = profile_links.user_id), 'mutual_servers') = 'mutual_servers'
                    AND (public.users_are_friends(auth.uid(), user_id) OR public.users_share_server(auth.uid(), user_id))
                )
            )
        )
    );

