# Supabase Realtime Authorization Manual Verification Guide

This document describes how to manually and programmatically verify Supabase Realtime Authorization on private channels (Remediation A2).

## Overview

Supabase Realtime Authorization enforces Row Level Security on `realtime.messages`. When a client subscribes to a private channel (configured via `config: { private: true }`), Supabase inspects the client's JWT and evaluates policies on `realtime.messages` using `realtime.topic()`.

### Policies Enforced (`00025_realtime_authorization_policies.sql`)

1. **Conversation Topics** (`conv:<id>:*`, `chat-room-<id>`, `call-room-<id>`):
   - Allowed only if `public.is_conversation_member(conv_id, auth.uid())` is true.
2. **User Private Topics** (`user:<id>:*`, `user_notifications_<id>`, `user-signals-<id>`):
   - Allowed only if `auth.uid() = user_id`.
3. **Server Voice Topics** (`server:<id>:*`, `server_voice_<id>`):
   - Allowed only if `public.is_server_member(server_id, auth.uid())` is true.
4. **Channel Chat Topics** (`channel:<id>:*`, `chan-room-<id>`, `voice_room_<id>`):
   - Allowed only if `public.is_channel_server_member(channel_id, auth.uid())` is true.
5. **Anonymous Role**:
   - Strictly denied access to `realtime.messages`.

---

## Automated Verification (PGlite Integration Tests)

Run the automated integration test suite which applies all migrations sequentially and tests role separation against in-memory PostgreSQL:

```bash
npm test tests/integration/postgres-rls.test.ts -t "S10"
```

Verified assertions in S10:
- Conversation members can broadcast and listen; non-members are rejected by RLS.
- Users can access their own `user:<id>:signals` topic; unauthorized users are blocked.
- Server members can access `server:<id>:voice`; non-members are blocked.
- Server members can access `channel:<id>:chat`; non-members are blocked.
- Anonymous/unauthenticated requests to `realtime.messages` are rejected.

---

## Live Verification Script

To verify against a live Supabase project with two authenticated users (Alice and Bob):

### 1. Dry Run / Self Test

```bash
node scripts/test-realtime-authz.mjs --dry-run
```

### 2. Live Verification with Two User Tokens

```bash
node scripts/test-realtime-authz.mjs \
  --url "$NEXT_PUBLIC_SUPABASE_URL" \
  --anonKey "$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  --tokenA "$JWT_ALICE" \
  --tokenB "$JWT_BOB" \
  --convId "$ALICE_PRIVATE_CONVERSATION_ID"
```

**Expected Outcome**:
- Client A connects and receives subscription status `SUBSCRIBED`.
- Client B (not in Alice's conversation) receives `CHANNEL_ERROR` or no broadcast messages.
- The test asserts that Client B receives 0 broadcast messages.
