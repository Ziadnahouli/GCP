-- Migration 00030: Add theme_mode, density, text_scale, and reduce_motion to user_settings
-- Allowed exception under Redesign Brief Rule 2 for user appearance customization.

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS theme_mode TEXT DEFAULT 'system' CHECK (theme_mode IN ('system', 'light', 'dark')),
ADD COLUMN IF NOT EXISTS density TEXT DEFAULT 'comfortable' CHECK (density IN ('comfortable', 'compact')),
ADD COLUMN IF NOT EXISTS text_scale INTEGER DEFAULT 100 CHECK (text_scale IN (90, 100, 112, 125)),
ADD COLUMN IF NOT EXISTS reduce_motion BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.user_settings.theme_mode IS 'Preferred UI theme mode: system, light, or dark';
COMMENT ON COLUMN public.user_settings.density IS 'Interface density: comfortable (36px rows) or compact (28px rows)';
COMMENT ON COLUMN public.user_settings.text_scale IS 'Root text scale percentage: 90, 100, 112, or 125';
COMMENT ON COLUMN public.user_settings.reduce_motion IS 'Whether to reduce animations and transitions for accessibility';
