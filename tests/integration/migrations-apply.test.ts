// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';

describe('Database Migrations Sequential Execution Gate (A6)', () => {
  let db: PGlite;

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  beforeEach(async () => {
    db = new PGlite();
    await db.ready;

    // Minimal stubs required before migrations run:
    // 1. auth schema, users table, uid() and role() helpers
    // 2. storage schema, buckets and objects tables, foldername() helper
    // 3. realtime schema and topic() helper
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
  });

  it('applies all migrations from supabase/migrations sequentially without error', async () => {
    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, 'utf8');

      try {
        await db.exec(sql);
      } catch (err: any) {
        throw new Error(`Migration ${file} failed to apply:\n${err.message || err}`);
      }
    }
  });
});
