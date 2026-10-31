// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';

describe('Profile Customization: Privacy (P3) and Validation (P4) Behavioral Gate', () => {
  let db: PGlite;

  const ALICE_ID = '11111111-1111-1111-1111-111111111111';
  const BOB_ID = '22222222-2222-2222-2222-222222222222';     // Friend
  const CHARLIE_ID = '33333333-3333-3333-3333-333333333333'; // Server member
  const DAVID_ID = '44444444-4444-4444-4444-444444444444';   // Stranger
  const EVE_ID = '55555555-5555-5555-5555-555555555555';     // Blocked user
  const SERVER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  const asUser = async (userId: string | null) => {
    if (userId) {
      await db.exec(`
        SET ROLE authenticated;
        SET request.jwt.claim.sub = '${userId}';
        SET request.jwt.claim.role = 'authenticated';
      `);
    } else {
      await db.exec(`
        SET ROLE anon;
        RESET request.jwt.claim.sub;
        SET request.jwt.claim.role = 'anon';
      `);
    }
  };

  const asSuperuser = async () => {
    await db.exec(`
      RESET ROLE;
      RESET request.jwt.claim.sub;
      RESET request.jwt.claim.role;
    `);
  };

  beforeEach(async () => {
    db = new PGlite();
    await db.ready;

    // Supabase stubs
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE SCHEMA IF NOT EXISTS realtime;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
          CREATE PUBLICATION supabase_realtime;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        email TEXT,
        raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
      $$ LANGUAGE sql STABLE;

      CREATE TABLE IF NOT EXISTS storage.buckets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        public BOOLEAN DEFAULT false,
        file_size_limit BIGINT,
        allowed_mime_types TEXT[]
      );

      CREATE TABLE IF NOT EXISTS storage.objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id TEXT NOT NULL REFERENCES storage.buckets(id),
        name TEXT NOT NULL,
        owner UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

      CREATE OR REPLACE FUNCTION storage.foldername(name TEXT)
      RETURNS TEXT[] LANGUAGE plpgsql AS $$
      BEGIN
        RETURN string_to_array(name, '/');
      END;
      $$;

      CREATE TABLE IF NOT EXISTS realtime.messages (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        topic TEXT NOT NULL,
        extension TEXT,
        inserted_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE OR REPLACE FUNCTION realtime.topic() RETURNS TEXT AS $$
        SELECT NULLIF(current_setting('request.realtime.topic', true), '');
      $$ LANGUAGE sql STABLE;
    `);

    // Dynamically load migrations
    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await db.exec(sql);
    }

    // Grants
    await db.exec(`
      GRANT USAGE ON SCHEMA public, auth, storage TO authenticated, anon;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT SELECT ON public.profiles TO anon;
      GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
    `);

    // Seed test users: Alice, Bob (Friend), Charlie (Mutual Server), David (Stranger), Eve (Blocked)
    await db.exec(`
      RESET ROLE;
      INSERT INTO auth.users (id, email) VALUES
        ('${ALICE_ID}', 'alice@nexus.gg'),
        ('${BOB_ID}', 'bob@nexus.gg'),
        ('${CHARLIE_ID}', 'charlie@nexus.gg'),
        ('${DAVID_ID}', 'david@nexus.gg'),
        ('${EVE_ID}', 'eve@nexus.gg')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.profiles (id, username, display_name, bio, custom_status, created_at) VALUES
        ('${ALICE_ID}', 'alice', 'Alice Gamer', 'Alice private secret bio', 'Secret Status', '2026-01-01 12:00:00+00'),
        ('${BOB_ID}', 'bob', 'Bob Player', 'Bob bio', 'Bob Status', '2026-01-01 12:00:00+00'),
        ('${CHARLIE_ID}', 'charlie', 'Charlie Master', 'Charlie bio', 'Charlie Status', '2026-01-01 12:00:00+00'),
        ('${DAVID_ID}', 'david', 'David Stranger', 'David bio', 'David Status', '2026-01-01 12:00:00+00'),
        ('${EVE_ID}', 'eve', 'Eve Blocked', 'Eve bio', 'Eve Status', '2026-01-01 12:00:00+00')
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        bio = EXCLUDED.bio,
        custom_status = EXCLUDED.custom_status,
        display_name = EXCLUDED.display_name,
        created_at = EXCLUDED.created_at;

      -- Reset username_changed_at to 60 days ago so Alice is eligible for username change
      UPDATE public.profiles SET username_changed_at = NOW() - INTERVAL '60 days';
      DELETE FROM public.username_history;

      -- Set Alice profile_visibility = 'friends'
      INSERT INTO public.user_settings (user_id, profile_visibility, presence_visibility)
      VALUES ('${ALICE_ID}', 'friends', 'friends')
      ON CONFLICT (user_id) DO UPDATE SET profile_visibility = 'friends', presence_visibility = 'friends';

      -- Alice and Bob are friends
      INSERT INTO public.friendships (user_id, friend_id) VALUES
        ('${ALICE_ID}', '${BOB_ID}'),
        ('${BOB_ID}', '${ALICE_ID}')
      ON CONFLICT DO NOTHING;

      -- Alice and Charlie share a server
      INSERT INTO public.servers (id, name, owner_id) VALUES
        ('${SERVER_ID}', 'Alice Gaming Sanctuary', '${ALICE_ID}')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.server_members (server_id, user_id, role) VALUES
        ('${SERVER_ID}', '${ALICE_ID}', 'owner'),
        ('${SERVER_ID}', '${CHARLIE_ID}', 'member')
      ON CONFLICT DO NOTHING;

      -- Alice blocked Eve
      INSERT INTO public.blocks (blocker_id, blocked_id) VALUES
        ('${ALICE_ID}', '${EVE_ID}')
      ON CONFLICT DO NOTHING;
    `);
  });

  describe('P3: Database-Enforced Profile Privacy Gate', () => {
    it('restricts stranger from directly querying private bio of user with profile_visibility = friends', async () => {
      // David is a stranger. Alice set profile_visibility = 'friends'.
      await asUser(DAVID_ID);

      // David queries Alice's profile row
      const res = await db.query<{ bio: string | null; custom_status: string | null }>(`
        SELECT bio, custom_status FROM public.profiles WHERE id = '${ALICE_ID}'
      `);

      // In a privacy-governed database, direct SELECT of sensitive columns is either denied or returns NULL/redacted for strangers
      const strangerCanSeeBio = res.rows.length > 0 && res.rows[0].bio !== null;
      expect(strangerCanSeeBio).toBe(false);
    });

    it('enforces get_profile_card RPC privacy rules for stranger, friend, server member, and blocked user', async () => {
      // Bob is Alice's friend -> should see bio
      await asUser(BOB_ID);
      const bobView = await db.query<{ bio: string | null }>(`
        SELECT bio FROM public.get_profile_card('${ALICE_ID}', NULL)
      `);
      expect(bobView.rows[0]?.bio).toBe('Alice private secret bio');

      // David is a stranger -> Alice's visibility is 'friends', so David MUST NOT see bio
      await asUser(DAVID_ID);
      const davidView = await db.query<{ bio: string | null }>(`
        SELECT bio FROM public.get_profile_card('${ALICE_ID}', NULL)
      `);
      expect(davidView.rows[0]?.bio ?? null).toBeNull();

      // Eve is blocked by Alice -> MUST NOT see bio
      await asUser(EVE_ID);
      const eveView = await db.query<{ bio: string | null }>(`
        SELECT bio FROM public.get_profile_card('${ALICE_ID}', NULL)
      `);
      expect(eveView.rows[0]?.bio ?? null).toBeNull();
    });
  });

  describe('P4: Database Integrity & Validation Gate', () => {
    it('rejects bio exceeding 500 characters with a database CHECK constraint', async () => {
      await asUser(ALICE_ID);
      const oversizedBio = 'A'.repeat(501);

      await expect(
        db.query(`
          UPDATE public.profiles
          SET bio = '${oversizedBio}'
          WHERE id = '${ALICE_ID}'
        `)
      ).rejects.toThrow();
    });

    it('prevents forging created_at (Member Since) date via immutable trigger', async () => {
      await asUser(ALICE_ID);

      // Alice attempts to forge her registration date back to 2015
      await db.query(`
        UPDATE public.profiles
        SET created_at = '2015-01-01 00:00:00+00'
        WHERE id = '${ALICE_ID}'
      `);

      // Verify created_at was either rejected or ignored/preserved by trigger
      const res = await db.query<{ created_at: string }>(`
        SELECT created_at FROM public.profiles WHERE id = '${ALICE_ID}'
      `);
      expect(new Date(res.rows[0].created_at).getFullYear()).not.toBe(2015);
    });

    it('rejects invalid non-hex banner_color and accent_color with CHECK constraints', async () => {
      await asUser(ALICE_ID);

      await expect(
        db.query(`
          UPDATE public.profiles
          SET banner_color = 'invalid-not-a-color'
          WHERE id = '${ALICE_ID}'
        `)
      ).rejects.toThrow();

      await expect(
        db.query(`
          UPDATE public.profiles
          SET accent_color = 'rgb(255,0,0)'
          WHERE id = '${ALICE_ID}'
        `)
      ).rejects.toThrow();
    });

    it('enforces https only and caps custom links at 5 per user', async () => {
      await asUser(ALICE_ID);

      // Insecure link rejected
      await expect(
        db.query(`
          INSERT INTO public.profile_links (user_id, label, url, position)
          VALUES ('${ALICE_ID}', 'Insecure Site', 'http://insecure.example.com', 0)
        `)
      ).rejects.toThrow();

      // Insert 5 valid https links
      for (let i = 0; i < 5; i++) {
        await db.query(`
          INSERT INTO public.profile_links (user_id, label, url, position)
          VALUES ('${ALICE_ID}', 'Link ${i}', 'https://example.com/${i}', ${i})
        `);
      }

      // 6th link is rejected by trigger
      await expect(
        db.query(`
          INSERT INTO public.profile_links (user_id, label, url, position)
          VALUES ('${ALICE_ID}', 'Overflow Link', 'https://example.com/overflow', 5)
        `)
      ).rejects.toThrow(/cannot have more than 5/);
    });

    it('enforces reserved names and 30-day username cooldown', async () => {
      await asUser(ALICE_ID);

      // Reserved username rejected
      await expect(
        db.query(`
          UPDATE public.profiles
          SET username = 'admin'
          WHERE id = '${ALICE_ID}'
        `)
      ).rejects.toThrow(/reserved/);

      // Valid rename succeeds
      await db.query(`
        UPDATE public.profiles
        SET username = 'alice-new-handle'
        WHERE id = '${ALICE_ID}'
      `);

      // Verify username history was recorded
      const history = await db.query<{ old_username: string; new_username: string }>(`
        SELECT old_username, new_username FROM public.username_history WHERE user_id = '${ALICE_ID}'
      `);
      expect(history.rows.length).toBe(1);
      expect(history.rows[0].old_username).toBe('alice');
      expect(history.rows[0].new_username).toBe('alice-new-handle');

      // Second rename immediately is rejected by cooldown trigger
      await expect(
        db.query(`
          UPDATE public.profiles
          SET username = 'alice-again'
          WHERE id = '${ALICE_ID}'
        `)
      ).rejects.toThrow(/once every 30 days/);
    });

    it('prevents regular users from self-granting badges in user_badges', async () => {
      await asUser(ALICE_ID);

      // Direct insert into user_badges by regular user is rejected by RLS
      await expect(
        db.query(`
          INSERT INTO public.user_badges (user_id, badge_id)
          VALUES ('${ALICE_ID}', 'founder')
        `)
      ).rejects.toThrow();
    });

    it('enforces storage path prefix isolation on avatar_path and banner_path', async () => {
      await asUser(ALICE_ID);

      // Alice tries to use Bob's avatar path
      await expect(
        db.query(`
          UPDATE public.profiles
          SET avatar_path = '${BOB_ID}/malicious_avatar.webp'
          WHERE id = '${ALICE_ID}'
        `)
      ).rejects.toThrow(/must start with the user ID folder/);

      // Alice sets her own avatar path - succeeds
      const res = await db.query(`
        UPDATE public.profiles
        SET avatar_path = '${ALICE_ID}/alice_avatar.webp'
        WHERE id = '${ALICE_ID}'
      `);
      expect(res.affectedRows).toBe(1);
    });

    it('manages per-server member profile and resolves effective fallback values', async () => {
      await asUser(CHARLIE_ID);

      // Charlie updates his own server profile via update_my_server_profile RPC
      await db.query(`
        SELECT public.update_my_server_profile(
          '${SERVER_ID}',
          'Sir Charlie of Sanctuary',
          NULL,
          NULL,
          'Sanctuary Defender',
          NULL
        )
      `);

      // Charlie cannot update Alice's member row directly
      const unauthorizedUpdate = await db.query(`
        UPDATE public.server_members
        SET nickname = 'Hacked Name'
        WHERE server_id = '${SERVER_ID}' AND user_id = '${ALICE_ID}'
      `);
      expect(unauthorizedUpdate.affectedRows).toBe(0);

      // Server owner (Alice) can update Charlie's nickname via set_member_nickname RPC
      await asUser(ALICE_ID);
      await db.query(`
        SELECT public.set_member_nickname('${SERVER_ID}', '${CHARLIE_ID}', 'Sanctuary Knight')
      `);

      // Charlie views his profile card in SERVER_ID: effective_display_name is the server nickname
      await asUser(CHARLIE_ID);
      const cardInServer = await db.query<{ effective_display_name: string; display_name: string }>(`
        SELECT effective_display_name, display_name FROM public.get_profile_card('${CHARLIE_ID}', '${SERVER_ID}')
      `);
      expect(cardInServer.rows[0].effective_display_name).toBe('Sanctuary Knight');
      expect(cardInServer.rows[0].display_name).toBe('Charlie Master');

      // Card without server_id falls back to global display_name
      const cardGlobal = await db.query<{ effective_display_name: string }>(`
        SELECT effective_display_name FROM public.get_profile_card('${CHARLIE_ID}', NULL)
      `);
      expect(cardGlobal.rows[0].effective_display_name).toBe('Charlie Master');
    });

    it('evaluates custom_status expiry in SQL without requiring a scheduler', async () => {
      await asUser(ALICE_ID);

      // Set custom status that expired 10 minutes ago
      await db.query(`
        UPDATE public.profiles
        SET custom_status = 'Expired Meeting', custom_status_expires_at = NOW() - INTERVAL '10 minutes'
        WHERE id = '${ALICE_ID}'
      `);

      // Bob (friend) queries profile card: custom_status is automatically redacted/nullified because it expired
      await asUser(BOB_ID);
      const res = await db.query<{ custom_status: string | null }>(`
        SELECT custom_status FROM public.get_profile_card('${ALICE_ID}', NULL)
      `);
      expect(res.rows[0].custom_status).toBeNull();
    });
  });
});
