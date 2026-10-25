# Nexus - High-Performance Gaming Communication Platform

Nexus is a production-minded gaming communication platform designed for squads and gaming communities. It features real authentication, persistent data, low-latency WebRTC media infrastructure, custom gaming themes, real-time messaging, file uploads, and LAN/ZeroTier network diagnostic awareness.

---

## 🚀 Implemented Phases Summary

### Phase 1: Visual Foundation, Design System & Authentication
* **Dark Charcoal & Multi-Theme Design System**:
  * Deep charcoal gaming palette (`#0d0f15`, `#11141c`, `#161922`, `#2a2f3d`).
  * Dynamic accent themes: **Violet Neon** (default), **Cyber Cyan**, **Vanguard Emerald**, **Crimson Fury**, and **Solar Amber**.
  * Custom slim gaming scrollbars and subtle glow accents (`glow-primary`).
* **Persistent Bottom User Panel**:
  * User avatar with live presence indicator (**Online**, **Idle**, **Do Not Disturb**).
  * Presence Status dropdown menu.
  * Instant Microphone Mute & Headset Deafen controls with toast alerts.
  * User Settings trigger.
* **Authentication & Identity (Supabase Auth)**:
  * Sign-in, registration, password recovery, and reset password flows.
  * Strict Zod request validation for emails, passwords, usernames, and display names.
  * Local Sandbox Mode fallback allowing UI exploration if credentials are unset.
* **User Profile & Appearance Management**:
  * Profile customization modal (Display Name, `@username`, Banner Color, Bio, Custom Status, Avatar URL).
  * Voice & Audio preferences (Input/Output volumes, Push-to-Talk, Soundboard toggle).

### Phase 2 & 3: Social Hub, Friends & Real-Time Messaging
* **Social Hub ([`FriendsView`](file:///c:/Users/nahou/Desktop/GCP/src/components/social/friends-view.tsx))**:
  * Interactive tabs: **Online**, **All**, **Pending Requests**, **Blocked Users**, and **+ Add Friend**.
  * Search filter across friends list with live count badges.
  * Send friend request by `@username` with validation and duplicate prevention.
  * Accept, decline, and cancel pending requests.
  * Remove friends and block/unblock users with server-side enforcement.
* **Real-Time Direct Messaging ([`ChatView`](file:///c:/Users/nahou/Desktop/GCP/src/components/chat/chat-view.tsx))**:
  * Direct 1-on-1 conversations with friends.
  * Real-time message delivery via Supabase Realtime channel subscriptions.
  * Message editing, deletion, and reply quoting.
  * Live typing indicator broadcast ("User is typing...").
  * Timestamps, avatar grouping, and auto-scroll to bottom.
* **Database Architecture & Atomic Transactions**:
  * [`supabase/migrations/00001_initial_schema.sql`](file:///c:/Users/nahou/Desktop/GCP/supabase/migrations/00001_initial_schema.sql): Complete table schema and triggers on `auth.users`.
  * [`supabase/migrations/00002_social_and_messaging_rls.sql`](file:///c:/Users/nahou/Desktop/GCP/supabase/migrations/00002_social_and_messaging_rls.sql): Atomic functions `accept_friend_request` and `create_or_get_direct_conversation`.

### Phase 4: File Uploads, Media Previews, Reactions, Search & Pinned Messages
* **Drag-and-Drop & File Attachments ([`upload.ts`](file:///c:/Users/nahou/Desktop/GCP/src/lib/storage/upload.ts))**:
  * Full drag-and-drop drop-zone overlay with file security inspection.
  * Strict validation blocking malicious executables (`.exe`, `.bat`, `.cmd`, `.sh`, etc.) and enforcing a 25MB file size limit.
  * Automated file name sanitization with cryptographic suffixes.
  * Pre-send attachment staging queue showing file name, formatted size, and remove button.
* **Interactive Media Rendering**:
  * In-chat Image previews with full-resolution Lightbox modal and download options.
  * Embedded video player support (`video/*`) and audio clips player (`audio/*`).
  * Formatted document cards with direct download links.
* **Emoji Reactions & Pinned Messages**:
  * Hover reaction toolbar (🔥, 🎯, 👍, 💀, 😂, ❤️, 🚀) with instant increment/decrement toggle badges.
  * Message pinning (`is_pinned`) with visual pin badge and header filter showing only pinned tactical messages.
* **Message Search**:
  * Real-time in-conversation search input in header bar filtering text content, sender names, and attachment file names.
* **Database Migration**:
  * [`supabase/migrations/00003_attachments_and_reactions.sql`](file:///c:/Users/nahou/Desktop/GCP/supabase/migrations/00003_attachments_and_reactions.sql): Tables for `message_attachments` and `message_reactions` with RLS and Supabase Realtime replication.

### Phase 5: Low-Latency Voice, Video & Screen Sharing Media Pipeline
* **LiveKit WebRTC Integration**:
  * Server-side token generation endpoint (`/api/calls/token`) validating conversation membership, caller profile, and blocklist rules.
  * Adaptive participant grid supporting voice rooms and video calls.
  * Real-time speaker neon halo indicators.
  * High-framerate 1080p 60FPS screen sharing spotlight mode with system audio indicators.
* **Network Diagnostics Telemetry Panel**:
  * Real-time latency (RTT ms), jitter ms, packet loss %, inbound/outbound kbps bitrate telemetry.
  * Transport route detection (Direct P2P, Relayed TURN, LiveKit SFU).

### Phase 6: Gaming Soundboard Engine
* **Web Audio Procedural Synthesis**:
  * Zero external sound file dependency required.
  * Built-in procedural effects: **Airhorn MLG**, **Victory Fanfare**, **Headshot Ping**, **Level Up**, **GG Good Game**, **Bruh Moment**, **Laser Beam**, **Tactical Quack**, and **Hype Drumroll**.
  * Dynamic animated audio waveform equalizer bars on playing sound cards.
* **Call Media Mixing & Anti-Spam**:
  * Exposes broadcast stream to inject soundboard audio directly into active LiveKit/WebRTC voice calls.
  * 600ms spam cooldown limiter.
  * Global Hotkeys (`1-9`) for instant meme triggers while in games.
  * Custom sound upload modal supporting MP3, WAV, OGG clips under 10 seconds.

### Phase 7: Gaming Servers (Guilds), Channels & Hierarchy
* **Leftmost Discord-Style Server Rail**:
  * Squircle icon rail with Home/Direct Messages toggle, active indicator pills, and server badges.
  * Template-based server creator ("Competitive Clan", "Squad Hangout", "Custom Clan").
* **Categorized Channel Sidebar & Real-Time Chat**:
  * Text channels (`# general`, `# tactics-and-strats`, `# highlights-and-clips`) and Voice rooms (`🔊 Squad Lounge 1`).
  * Live connected player lists under voice rooms.
  * Server settings modal (Overview, Channels management, Roles & Permissions, Danger Zone).
  * Right squad members sidebar grouped by role (👑 Clan Leader, 🛡️ Officers, 🎮 Members).

### Phase 8: ZeroTier & LAN Gaming Direct Connectivity & Desktop Architecture
* **Direct LAN & ZeroTier Diagnostics**:
  * Virtual adapter IP inspector (`10.147.x.x`) with one-click clipboard copy.
  * ZeroTier 16-character Network ID synchronization.
  * Direct P2P subnet latency ping benchmark (sub-15ms local UDP routing).
  * Game lobby hosting quick reference guide (Minecraft `:25565`, CS2 `:27015`).
* **Windows Desktop Companion (`desktop/`)**:
  * Tauri-powered native Windows desktop companion with ~15MB memory footprint.
  * Global hotkeys, native Windows notifications, and system tray minimization.

---

## 🛠️ Tech Stack

* **Framework**: Next.js 14 (App Router)
* **Frontend**: React 18, TypeScript (Strict Mode)
* **Styling**: Tailwind CSS, CSS Variables Design System
* **Icons**: Lucide Icons
* **Audio Engine**: Web Audio API (Oscillators, Biquad Filters, MediaStreamDestination)
* **Authentication & Database**: Supabase Auth, PostgreSQL, Supabase Realtime, Supabase Storage
* **Media & Calls**: LiveKit & WebRTC
* **Validation**: Zod
* **Testing**: Vitest & React Testing Library (45 unit tests passing)
* **Desktop Client**: Tauri (Rust) Windows Companion

---

## ⚡ Quick Start & Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Database Migrations in Supabase
In your Supabase Dashboard SQL Editor or via Supabase CLI:
Execute migrations in numerical order from `00001_initial_schema.sql` through `00028_realtime_authorization_hardening.sql`.

### 3. Configure Supabase Realtime Authorization
1. In the Supabase Dashboard, navigate to **Project Settings** > **Realtime**.
2. Under Channel Authorization, ensure **Allow public access** is **DISABLED** (switched OFF).
3. This guarantees that all private channels (`config: { private: true }`) require a valid JWT and are authoritatively governed by PostgreSQL RLS on `realtime.messages`. See [`docs/realtime-authz-manual-test.md`](file:///c:/Users/nahou/Desktop/GCP/docs/realtime-authz-manual-test.md) for automated and manual verification.

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Build Standalone Desktop Companion (Optional)
```bash
npx @tauri-apps/cli dev
```

---

## 🧪 Testing & Verification

Run automated unit and integration tests:
```bash
npm run test
```

Run TypeScript strict type checking:
```bash
npm run typecheck
```

Run ESLint:
```bash
npm run lint
```

Build production bundle:
```bash
npm run build
```

---

## 🗺️ Implementation Roadmap

* **Phase 1 [COMPLETED]**: Visual foundation, design system, Supabase configuration, authentication flows, persistent user bar, and profile management.
* **Phase 2 & 3 [COMPLETED]**: Social Hub, friends system (search, requests, acceptance, blocking), direct conversations, and real-time messaging with Supabase Realtime persistence.
* **Phase 4 [COMPLETED]**: Private file uploads, drag-and-drop, message reactions, message search, pinned messages, and media lightbox gallery.
* **Phase 5 [COMPLETED]**: LiveKit WebRTC voice/video calls, screen sharing spotlight, and network diagnostics telemetry panel.
* **Phase 6 [COMPLETED]**: Gaming Soundboard engine, procedural audio synthesizers, call media stream mixing, global hotkeys (`1-9`), and custom uploads.
* **Phase 7 [COMPLETED]**: Servers, text/voice channels, role hierarchy (Owner, Officer, Member), and squad members lists.
* **Phase 8 [COMPLETED]**: ZeroTier & LAN direct networking control center, virtual IP manager, direct P2P ping benchmark, and Tauri Windows desktop companion.
* **Phase 9 [COMPLETED]**: Production build compilation, security hardening, and test automation (227+ tests passing).
