# System Architecture Documentation

## 1. Authentication & Account Deletion Lifecycle

### Account Deletion
Account deletion is triggered from `SettingsModal` (`src/components/layout/settings-modal.tsx`) via the database RPC `delete_user_account()`.

```mermaid
sequenceDiagram
    autonumber
    actor User as Authenticated Client
    participant Modal as SettingsModal (Client)
    participant DB as PostgreSQL (Supabase)
    participant Auth as auth.users Schema

    User->>Modal: Clicks "Delete Account" & Confirms
    Modal->>DB: rpc('delete_user_account')
    Note over DB: Runs as SECURITY DEFINER
    DB->>DB: Cascade delete owned servers, memberships, friendships, devices
    DB->>DB: Delete profile row from public.profiles
    DB->>Auth: DELETE FROM auth.users WHERE id = auth.uid()
    DB-->>Modal: Return true
    Modal->>User: supabase.auth.signOut() & Redirect to /login
```

### Architectural Notes on `auth.users` Deletion
- **Direct Database Execution**: The `delete_user_account()` function runs as `SECURITY DEFINER` (database superuser/postgres role), allowing it to delete the row directly from the PostgreSQL `auth.users` table along with all associated public tables in an atomic transaction.
- **Client Limitation**: Browser clients using anon/publishable keys cannot directly delete or alter rows in `auth.users` via standard Supabase client SDK calls (`supabase.auth.admin.deleteUser(...)` requires the `SUPABASE_SERVICE_ROLE_KEY`).
- **External GoTrue Sync**: If Supabase Auth is hosted in a decoupled multi-region GoTrue deployment with independent cache layers, a server route utilizing the `SUPABASE_SERVICE_ROLE_KEY` can be used to invoke `supabase.auth.admin.deleteUser(id)` to flush any external session caches.

---

## 2. Realtime Channels & Realtime Authorization (GA)

### Architecture
All client realtime subscriptions are routed through `RealtimeHub` (`src/lib/realtime/realtime-hub.ts`) to manage reference counts and avoid redundant WebSocket connections.

Every channel transmitting private data specifies `config: { private: true }`. Supabase Realtime Authorization validates topics against Row Level Security policies on `realtime.messages` using `public.realtime_topic_authorized(topic, auth.uid())`:

| Topic Format | Authorized Roles / Conditions |
|---|---|
| `conv:<id>:chat`, `conv:<id>:call` | Verified via `public.is_conversation_member(id, auth.uid())` |
| `user:<id>:signals`, `user_notifications_<id>` | Verified via `auth.uid() = id` |
| `server:<id>:voice` | Verified via `public.is_server_member(id, auth.uid())` |
| `channel:<id>:chat`, `voice_room_<id>` | Verified via `public.is_channel_server_member(id, auth.uid())` |
| `anon` role | Revoked / Blocked on all realtime messages |

---

## 3. Rate Limiting Architecture

The `/api/calls/token` route enforces a sliding-window rate limit (30 requests / minute) using an in-memory `Map`.

### Serverless & Multi-Instance Considerations
- In serverless runtimes (Next.js lambda functions / Vercel), in-memory rate limiting operates per-instance and does not synchronize state across horizontally scaled instances.
- It provides defense-in-depth against runaway client retry loops on the same warm instance.
- For strictly bounded rate limiting across multiple instances, production deployments should employ:
  - Upstash Redis (`@upstash/ratelimit`) using REST API tokens.
  - A persistent Supabase rate limit table with atomic increments.
