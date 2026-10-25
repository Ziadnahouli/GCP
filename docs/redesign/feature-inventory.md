# Nexus Redesign — Feature Inventory & Parity Contract

> **Contract**: Every user-visible function in the Nexus codebase is inventoried below with its source file. In the Clean Pro redesign, every single function is mapped to a screen and visual state, and will be ticked off as verified. **Zero features or user functions are removed.**

---

## 1. Authentication & Onboarding

| Feature | Source File | Redesign Screen / Component | Parity Status |
| :--- | :--- | :--- | :--- |
| **Login** (Email & Password, validation, session persistence, remember me) | `src/app/(auth)/login/page.tsx` | Auth Card (`/login`) | [x] Verified |
| **Login Error States** (Invalid credentials, unverified email, rate limit) | `src/app/(auth)/login/page.tsx` | Inline Error Callout & Field States | [x] Verified |
| **Registration** (Email, Password, Display Name, Username validation) | `src/app/(auth)/register/page.tsx` | Auth Card (`/register`) | [x] Verified |
| **Username Availability Hint** (Realtime check) | `src/app/(auth)/register/page.tsx` | Inline Helper / Input Suffix Slot | [x] Verified |
| **Terms of Service / Privacy Agreement** | `src/app/(auth)/register/page.tsx` | Footer Link Row | [x] Verified |
| **Email Verification Sent Screen** (Resend cooldown, check inbox notice) | `src/app/(auth)/register/page.tsx` | Centered Feedback Card | [x] Verified |
| **Forgot Password** (Email input, submit reset request) | `src/app/(auth)/forgot-password/page.tsx` | Auth Card (`/forgot-password`) | [x] Verified |
| **Reset Link Sent Screen** (Success notification, back to login) | `src/app/(auth)/forgot-password/page.tsx` | Centered Feedback Card | [x] Verified |
| **Reset Password** (New password input, confirm password, strength feedback) | `src/app/(auth)/reset-password/page.tsx` | Auth Card (`/reset-password`) | [x] Verified |
| **Invite Landing Page** (`/invite/[code]`, server preview with icon, name, member count) | `src/app/invite/[code]/page.tsx` | Server Invite Card (`/invite/[code]`) | [x] Verified |
| **Invite Action: Join Server** (Authenticated user directly joins) | `src/app/invite/[code]/page.tsx` | Primary CTA Button | [x] Verified |
| **Invite Action: Sign In / Create Account** (Preserves invite code in redirect) | `src/app/invite/[code]/page.tsx` | Secondary Ghost/Outline CTA | [x] Verified |
| **Invite States** (Invalid, Expired, Revoked, Banned, Already a member) | `src/app/invite/[code]/page.tsx` | Dedicated State Cards with Actions | [x] Verified |

---

## 2. Navigation & App Shell

| Feature | Source File | Redesign Screen / Component | Parity Status |
| :--- | :--- | :--- | :--- |
| **Server Rail** (Server icons, initials fallback, active pill indicator, unread dot) | `src/components/servers/server-rail.tsx` | Unified Rail (56px) | [x] Verified |
| **Home / Direct Messages Button** (Nexus icon / Home button with unread count) | `src/components/servers/server-rail.tsx` | Rail Item (Top) | [x] Verified |
| **Add Server Modal Trigger** (Plus button to create or join server) | `src/components/servers/server-rail.tsx` | Rail Action Button | [x] Verified |
| **Notifications Inbox Trigger** (Bell icon with unread indicator) | `src/components/servers/server-rail.tsx` | Rail Action / Mobile Tab | [x] Verified |
| **Settings Modal Trigger** (Gear icon on rail or user bar) | `src/components/servers/server-rail.tsx`, `user-bar.tsx` | Rail Action / User Bar Action | [x] Verified |
| **Sidebar Navigation** (Collapsible channel tree, direct messages list) | `src/components/layout/sidebar.tsx`, `server-sidebar.tsx` | Resizable Sidebar (220–320px) | [x] Verified |
| **User Bar** (Current user avatar, status indicator, display name, username) | `src/components/layout/user-bar.tsx` | Sidebar Bottom Dock | [x] Verified |
| **User Bar Controls** (Microphone Mute toggle, Deafen toggle, Settings gear) | `src/components/layout/user-bar.tsx` | User Bar Action Buttons | [x] Verified |
| **Status Picker Popover** (Online, Idle, Do Not Disturb, Invisible / Offline) | `src/components/layout/status-selector.tsx` | Status Picker Popover | [x] Verified |
| **Mobile Bottom Tab Bar** (Home, Messages, Servers, Inbox, You) | `src/app/(main)/layout.tsx` | Mobile Tab Bar (56px + safe-area) | [x] Verified |
| **Mobile Floating Voice Mini-Bar** (Attached above bottom tabs when connected) | `src/components/servers/voice-connected-bar.tsx` | Voice Mini-Bar (52px) | [x] Verified |
| **Tablet Slide-over Sidebar** (Drawer on medium viewports 640–1023px) | `src/app/(main)/layout.tsx` | Slide-over Sheet | [x] Verified |
| **Tauri Desktop Title Bar & Window Controls** (Drag region, minimize, maximize, close) | `src/app/(main)/layout.tsx` | Custom Desktop Title Bar | [x] Verified |

---

## 3. Social & Friends Hub

| Feature | Source File | Redesign Screen / Component | Parity Status |
| :--- | :--- | :--- | :--- |
| **Friends Navigation Tabs** (All, Online, Pending, Blocked, Add Friend) | `src/components/social/friends-view.tsx` | Friends Segmented Tabs | [x] Verified |
| **Online Friends List** (Presence indicator, activity / custom status) | `src/components/social/friends-view.tsx` | Friends List View | [x] Verified |
| **All Friends List** (Alphabetical or recent sorting, mutual status) | `src/components/social/friends-view.tsx` | Friends List View | [x] Verified |
| **Pending Friend Requests** (Incoming with Accept/Decline, Outgoing with Cancel) | `src/components/social/friends-view.tsx` | Pending Requests List | [x] Verified |
| **Blocked Users Management** (List blocked users, Unblock action) | `src/components/social/friends-view.tsx` | Blocked List View | [x] Verified |
| **Add Friend Action** (Enter username with immediate validation) | `src/components/social/friends-view.tsx` | Inline Add Friend Form | [x] Verified |
| **Friend Row Actions** (Message DM, Start Voice Call, Start Video Call, More menu) | `src/components/social/friends-view.tsx` | Row Action Toolbar | [x] Verified |
| **Remove Friend Action** (Confirmation prompt) | `src/components/social/friends-view.tsx` | Action Confirmation Dialog | [x] Verified |
| **User Profile Card Popover** (Avatar, bio, mutual servers/friends, actions) | `src/components/social/friends-view.tsx` | User Card Popover / Sheet | [x] Verified |
| **User Report Modal** (Reason selection, details submission) | `src/components/social/report-modal.tsx` | Report Dialog / Sheet | [x] Verified |

---

## 4. Direct Messages & Group Conversations

| Feature | Source File | Redesign Screen / Component | Parity Status |
| :--- | :--- | :--- | :--- |
| **DM List** (Direct message previews, latest message text, timestamps) | `src/components/layout/sidebar.tsx` | DM Sidebar Section | [x] Verified |
| **Unread Indicators** (Bold conversation title, badge pill with unread count) | `src/components/layout/sidebar.tsx` | DM Row Unread Badge | [x] Verified |
| **Active Call Indicator in DM List** (Green pulse / live badge) | `src/components/layout/sidebar.tsx` | DM Row Call Pill | [x] Verified |
| **Muted DM Icon** (Bell slashed icon for muted conversations) | `src/components/layout/sidebar.tsx` | DM Row Mute Icon | [x] Verified |
| **Create Group Conversation Modal** (Multi-friend selector, group title, creation) | `src/components/chat/create-group-modal.tsx` | Create Group Dialog / Sheet | [x] Verified |
| **Group Settings Side Panel / Modal** (Rename group, icon upload, notification settings) | `src/components/chat/group-settings-modal.tsx` | Group Details Drawer / Sheet | [x] Verified |
| **Group Members Management** (Add members, role assignments, kick member) | `src/components/chat/group-settings-modal.tsx` | Group Member List | [x] Verified |
| **Leave Group Action** (Ownership transfer if owner, leave confirmation) | `src/components/chat/group-settings-modal.tsx` | Leave Group Confirmation | [x] Verified |

---

## 5. Chat View & Messaging

| Feature | Source File | Redesign Screen / Component | Parity Status |
| :--- | :--- | :--- | :--- |
| **Chat Header** (Conversation name, avatar, presence/topic, action buttons) | `src/components/chat/chat-view.tsx` | Chat Header (52px) | [x] Verified |
| **1:1 Call Buttons** (Voice call button, Video call button) | `src/components/chat/chat-view.tsx` | Header Action Buttons | [x] Verified |
| **Search in Conversation** (Filter messages within current conversation) | `src/components/chat/chat-view.tsx` | Header Action / Search Bar | [x] Verified |
| **Pinned Messages Drawer** (List pinned messages, Jump to message, Unpin) | `src/components/chat/chat-view.tsx` | Pinned Messages Panel | [x] Verified |
| **Details / Member Panel Toggle** (Toggle right side pane) | `src/components/chat/chat-view.tsx` | Header Toggle Button | [x] Verified |
| **Message List Rendering** (Flat rows, author avatar, display name, timestamp) | `src/components/chat/chat-view.tsx` | Virtualized Message List | [x] Verified |
| **Message Grouping** (Consecutive messages from author within 5m collapsed) | `src/components/chat/chat-view.tsx` | Compact Message Row | [x] Verified |
| **Sticky Date Separators** (Grouping by calendar day) | `src/components/chat/chat-view.tsx` | Date Divider Row | [x] Verified |
| **New Messages Accent Divider** (Visible at boundary of unread messages) | `src/components/chat/chat-view.tsx` | Accent Unread Divider | [x] Verified |
| **Jump to Latest Pill** (Appears on scrolling up with unread messages) | `src/components/chat/chat-view.tsx` | Floating Jump-to-Latest Button | [x] Verified |
| **Load Older Messages on Scroll** (Infinite pagination) | `src/components/chat/chat-view.tsx` | Virtual List Top Trigger | [x] Verified |
| **Message Content Formatting** (Markdown, links, code blocks, mentions) | `src/components/chat/message-content.tsx` | Rich Message Content | [x] Verified |
| **Link Previews** (Title, description, thumbnail, domain) | `src/components/chat/link-preview.tsx` | Compact Link Card | [x] Verified |
| **Server Invite Cards** (Embedded server preview with Join CTA) | `src/components/chat/message-content.tsx` | Rich Server Invite Card | [x] Verified |
| **Squad Call Notification Cards** (Live call card with participant list & Join CTA) | `src/components/chat/message-content.tsx` | Squad Call Banner Card | [x] Verified |
| **Message Hover Toolbar (Desktop)** (React, Reply, Edit, Forward, Pin, Delete, More) | `src/components/chat/chat-view.tsx` | Floating Micro-Toolbar | [x] Verified |
| **Message Long-Press Sheet (Mobile)** (Same actions as desktop toolbar) | `src/components/chat/chat-view.tsx` | Mobile Bottom Action Sheet | [x] Verified |
| **Reaction Picker & Reaction Pills** (Add reaction, counts, user highlight) | `src/components/chat/chat-view.tsx` | Reaction Pills Strip & Popover | [x] Verified |
| **Message Quoted Reply** (Reply banner above composer, quote snippet in row) | `src/components/chat/chat-view.tsx` | Reply Context Bar & Snippet | [x] Verified |
| **Message Edit Mode** (Inline textarea, Save / Cancel actions, (edited) tag) | `src/components/chat/chat-view.tsx` | Inline Editor | [x] Verified |
| **Forward Message Modal** (Select friend or channel, add optional note) | `src/components/chat/forward-modal.tsx` | Forward Message Dialog | [x] Verified |
| **Delete Message Action** (Confirmation dialog) | `src/components/chat/chat-view.tsx` | Delete Confirmation Dialog | [x] Verified |
| **Media Attachments** (Image grid with full lightbox viewer, audio player, video) | `src/components/chat/message-content.tsx` | Attachment Grid & Lightbox | [x] Verified |
| **File Attachments** (File name, size, type icon, download button) | `src/components/chat/message-content.tsx` | File Attachment Card | [x] Verified |
| **File Upload Progress** (Upload progress bar, cancel upload button) | `src/components/chat/chat-view.tsx` | Composer Attachment Preview | [x] Verified |
| **Typing Indicator** (Who is typing dots and names) | `src/components/chat/chat-view.tsx` | Typing Indicator Bar | [x] Verified |
| **Composer Textarea** (Auto-growing 1–8 lines, draft persistence per channel) | `src/components/chat/chat-view.tsx` | Auto-expanding Composer | [x] Verified |
| **Composer Attachment Button** (File picker, drag-and-drop, clipboard paste) | `src/components/chat/chat-view.tsx` | Composer File Button & Dropzone | [x] Verified |
| **Composer Emoji Picker** (Searchable emoji popover) | `src/components/chat/chat-view.tsx` | Emoji Picker Popover | [x] Verified |
| **Composer @ Mention Autocomplete** (Users, roles, @here, @everyone) | `src/components/chat/chat-view.tsx` | Mention Suggestions Popover | [x] Verified |
| **Composer Character Counter** (Appears at 90% of max limit) | `src/components/chat/chat-view.tsx` | Character Counter Badge | [x] Verified |
| **Composer Disabled States** (Blocked, Timed out with cooldown timer, Read-only, Offline) | `src/components/chat/chat-view.tsx` | Disabled Composer Banner | [x] Verified |
| **Failed Message State** (Not sent, Retry and Delete buttons, preserved text) | `src/components/chat/chat-view.tsx` | Message Error Status Bar | [x] Verified |
| **System Messages** (Call started, Call missed, Member joined/left, Role changed) | `src/components/chat/chat-view.tsx` | Centered System Message Row | [x] Verified |

---

## 6. Servers & Channels

| Feature | Source File | Redesign Screen / Component | Parity Status |
| :--- | :--- | :--- | :--- |
| **Server Header Menu** (Invite people, Server settings, Create channel, Leave server) | `src/components/servers/server-sidebar.tsx` | Server Dropdown Menu | [x] Verified |
| **Collapsible Channel Categories** (Accordion groups for channels) | `src/components/servers/server-sidebar.tsx` | Collapsible Category Headers | [x] Verified |
| **Text Channels List** (`#` icon, unread indicator, active indicator, channel name) | `src/components/servers/server-sidebar.tsx` | Channel Row | [x] Verified |
| **Voice Channels List** (Speaker icon, user count, active voice occupancy) | `src/components/servers/server-sidebar.tsx` | Voice Channel Row | [x] Verified |
| **Live Voice Channel Occupants** (Nested users with speaking ring and mute badge) | `src/components/servers/server-sidebar.tsx` | Nested Participant Rows | [x] Verified |
| **Channel Reordering** (Drag-and-drop reordering for administrators) | `src/components/servers/server-sidebar.tsx` | Reorderable Channel Tree | [x] Verified |
| **Create Channel Modal** (Name, type text/voice, category, private toggle) | `src/components/servers/server-sidebar.tsx` | Create Channel Dialog | [x] Verified |
| **Channel Topic & Slowmode Notice** (Header topic display, slowmode countdown) | `src/components/servers/channel-view.tsx` | Channel Header & Slowmode Bar | [x] Verified |
| **Server Members Panel** (Grouped by role: Owner, Admins, Online, Offline) | `src/components/servers/channel-view.tsx` | Right Members Panel | [x] Verified |
| **Member Context Menu / Action Sheet** (Message, Profile, Mute, Timeout, Kick, Ban) | `src/components/servers/channel-view.tsx` | Member Context Menu | [x] Verified |
| **Create Server Modal** (Server name, icon upload, template choice) | `src/components/servers/create-server-modal.tsx` | Create Server Dialog | [x] Verified |
| **Join Server Modal** (Enter invite code / link directly) | `src/components/servers/create-server-modal.tsx` | Join Server Tab / Dialog | [x] Verified |
| **Server Invite Modal** (Create invite link, expiry selector, max uses, copy link, friend picker) | `src/components/servers/invite-modal.tsx` | Invite People Dialog | [x] Verified |
| **Server Settings: Overview** (Server name, icon, description, system channel) | `src/components/servers/server-settings-modal.tsx` | Server Settings Overview Tab | [x] Verified |
| **Server Settings: Roles & Permissions** (Role list, color, permission toggles) | `src/components/servers/server-settings-modal.tsx` | Roles Management Panel | [x] Verified |
| **Server Settings: Channels** (Channel management, category assignment) | `src/components/servers/server-settings-modal.tsx` | Channel Management Panel | [x] Verified |
| **Server Settings: Invites** (Active invites list, uses, revoke invite) | `src/components/servers/server-settings-modal.tsx` | Invites Management Panel | [x] Verified |
| **Server Settings: Moderation & Audit Logs** (Bans list, timeouts, audit logs) | `src/components/servers/server-settings-modal.tsx` | Moderation & Audit Logs Panel | [x] Verified |
| **Server Settings: Danger Zone** (Transfer ownership, Delete server with typed name) | `src/components/servers/server-settings-modal.tsx` | Danger Zone Panel | [x] Verified |
| **Leave Server Flow** (Prompt to transfer ownership if owner, else confirm leave) | `src/components/servers/server-sidebar.tsx` | Leave Server Dialog | [x] Verified |

---

## 7. Voice, Video & Calls

| Feature | Source File | Redesign Screen / Component | Parity Status |
| :--- | :--- | :--- | :--- |
| **Voice Connected Dock** (Channel name, elapsed timer, ping indicator) | `src/components/servers/voice-connected-bar.tsx` | Sidebar Voice Dock | [x] Verified |
| **Voice Dock Controls** (Mute, Deafen, Screen Share, Soundboard, Settings, Disconnect) | `src/components/servers/voice-connected-bar.tsx` | Voice Dock Action Buttons | [x] Verified |
| **Voice Lounge / Participant Popup** (Participant tiles, speaking rings, per-user volume) | `src/components/servers/voice-lounge-popup.tsx` | Voice Lounge View / Popover | [x] Verified |
| **Noise Suppression Selector** (Off, Light, Balanced, Strong, engine indicator & fallback) | `src/components/servers/voice-lounge-popup.tsx` | Noise Cancellation Switcher | [x] Verified |
| **Active 1:1 & Group Call Modal** (Floating resizable desktop window / full-screen mobile) | `src/components/calls/call-modal.tsx` | Call Screen / Floating Panel | [x] Verified |
| **Call Participant Video & Audio Grid** (Camera tiles, screen share view, spotlight) | `src/components/calls/call-modal.tsx` | Call Grid Layout | [x] Verified |
| **Call Controls** (Mute mic, Toggle camera, Toggle screen share, Soundboard, Leave) | `src/components/calls/call-modal.tsx` | Call Control Bar (Min 48px) | [x] Verified |
| **Call Network Diagnostics Drawer** (Bitrate, packet loss, RTT latency, codec) | `src/components/calls/network-diagnostics.tsx` | Diagnostics Drawer / Panel | [x] Verified |
| **Incoming Call Alert** (Desktop non-blocking top banner / mobile full screen, Accept/Decline) | `src/components/calls/incoming-call-modal.tsx` | Incoming Call Banner / Sheet | [x] Verified |
| **DND Mode Call Silence** (Suppression of incoming ringtone & banner in DND status) | `src/features/calls/call-context.tsx` | Background Caller Handling | [x] Verified |
| **Soundboard Modal & Quick Soundboard** (Grid of audio clips, shortcut trigger, volume) | `src/components/soundboard/soundboard-modal.tsx` | Soundboard Dialog / Popover | [x] Verified |
| **Upload Custom Soundboard Clip** (Name, audio file, shortcut assignment) | `src/components/soundboard/soundboard-modal.tsx` | Custom Sound Upload Form | [x] Verified |

---

## 8. Settings & Preferences

| Feature | Source File | Redesign Screen / Component | Parity Status |
| :--- | :--- | :--- | :--- |
| **Settings Navigation** (Desktop 2-pane navigation with search, mobile sub-pages) | `src/components/layout/settings-modal.tsx` | Settings Dialog / Pages | [x] Verified |
| **Appearance: Theme Switcher** (System, Light, Dark) | `src/components/layout/settings-modal.tsx` | Theme Mode Radio / Buttons | [x] Verified |
| **Appearance: Accent Color** (Violet, Cyan, Emerald, Crimson, Amber) | `src/components/layout/settings-modal.tsx` | Accent Swatches Strip | [x] Verified |
| **Appearance: Density Setting** (Comfortable [36px], Compact [28px]) | `src/components/layout/settings-modal.tsx` | Density Toggle | [x] Verified |
| **Appearance: Text Scale** (90%, 100%, 112%, 125%) | `src/components/layout/settings-modal.tsx` | Text Scale Slider / Stepper | [x] Verified |
| **Appearance: Reduced Motion** (System default, On, Off) | `src/components/layout/settings-modal.tsx` | Reduced Motion Toggle | [x] Verified |
| **Voice & Audio: Devices** (Input device dropdown, Output device dropdown) | `src/components/layout/settings/VoiceAudioTab.tsx` | Device Selectors | [x] Verified |
| **Voice & Audio: Volume Controls** (Input gain slider, Output volume slider) | `src/components/layout/settings/VoiceAudioTab.tsx` | Audio Volume Sliders | [x] Verified |
| **Voice & Audio: Mic Test** (Realtime before/after noise reduction audio meter) | `src/components/layout/settings/VoiceAudioTab.tsx` | Interactive Mic Test Bar | [x] Verified |
| **Voice & Audio: Noise Mode** (Off, Light, Balanced, Strong) | `src/components/layout/settings/VoiceAudioTab.tsx` | Noise Mode Radio Cards | [x] Verified |
| **Voice & Audio: Input Mode** (Voice Activity Detection vs Push to Talk, PTT keybind) | `src/components/layout/settings/VoiceAudioTab.tsx` | Input Mode Radio Cards | [x] Verified |
| **Voice & Audio: Processing Toggles** (Echo cancellation, Auto gain control) | `src/components/layout/settings/VoiceAudioTab.tsx` | Audio Processing Switches | [x] Verified |
| **Profile Settings** (Avatar upload, banner image, display name, bio, status) | `src/components/layout/settings/ProfileTab.tsx` | Profile Editor Form | [x] Verified |
| **Security & Account** (Email change, Password change) | `src/components/layout/settings/SecurityTab.tsx` | Account Security Cards | [x] Verified |
| **Active Sessions / Devices** (Current session, other active sessions, Sign out others) | `src/components/layout/settings/SecurityTab.tsx` | Active Sessions List | [x] Verified |
| **Delete Account Action** (Consequences warning dialog, password confirmation) | `src/components/layout/settings/SecurityTab.tsx` | Account Deletion Flow | [x] Verified |
| **Notifications Settings** (Enable/disable chime sounds, desktop push alerts, DND rules) | `src/components/layout/settings-modal.tsx` | Notification Toggles | [x] Verified |
| **Keybinds Configuration** (Global mute, deafen, push-to-talk keybind assignment) | `src/components/layout/settings/KeybindsTab.tsx` | Keybinds Table / Editor | [x] Verified |
| **Advanced: Logs Window** (Realtime application logs, filter by level, export) | `src/components/diagnostics/logs-window.tsx` | Logs Modal / Panel | [x] Verified |
| **Advanced: ZeroTier Mesh Network** (Network ID, join/leave mesh network status) | `src/components/network/zerotier-modal.tsx` | ZeroTier Dialog | [x] Verified |
| **Advanced: Desktop Audio Mixer Bridge** (Python mixer adapter status and control) | `src/components/audio/mixer-adapter-bridge.tsx` | Audio Mixer Bridge Panel | [x] Verified |

---

## 9. Search, Command Palette & Notifications

| Feature | Source File | Redesign Screen / Component | Parity Status |
| :--- | :--- | :--- | :--- |
| **Command Palette (Cmd/Ctrl + K)** (Fast navigation, full text search, quick actions) | `src/components/search/global-search-modal.tsx` | Radix / cmdk Command Palette | [x] Verified |
| **Palette Groups** (Conversations, People, Servers, Channels, Messages, Actions) | `src/components/search/global-search-modal.tsx` | Grouped Search Results | [x] Verified |
| **Notifications Inbox** (List notifications, unread badges, Mark all as read) | `src/components/notifications/notifications-popover.tsx` | Popover (Desktop) / Tab (Mobile) | [x] Verified |
| **Notification Item Actions** (Jump to channel/DM, dismiss notification) | `src/components/notifications/notifications-popover.tsx` | Notification Item Row | [x] Verified |

---

## 10. System States & Fallbacks

| Feature | Source File | Redesign Screen / Component | Parity Status |
| :--- | :--- | :--- | :--- |
| **Offline Banner** (Non-blocking banner when internet connection is lost) | `src/components/network/offline-banner.tsx` | Top System Notice Banner | [x] Verified |
| **Reconnecting State** (Visual reconnecting banner/spinner during network blip) | `src/components/network/offline-banner.tsx` | Top System Notice Banner | [x] Verified |
| **Global Error Boundary & Error Page** (`error.tsx`, `global-error.tsx`) | `src/app/error.tsx`, `src/components/ui/error-boundary.tsx` | Clean Minimalist Error Screen | [x] Verified |
| **404 Not Found Page** (`not-found.tsx`) | `src/app/not-found.tsx` | 404 Error Screen | [x] Verified |
| **Loading Splash Page** (`loading.tsx`) | `src/app/loading.tsx` | Minimalist Loading Splash | [x] Verified |
| **Empty States** (No friends, no messages, no servers, no search results) | Across list views | Dedicated EmptyState Component | [x] Verified |
| **Loading Skeletons** (Friend list, message history, server channels) | Across list views | Dedicated Skeleton Component | [x] Verified |
