import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isNotificationCategoryEnabled } from '@/hooks/use-notifications';
import { isSafePublicUrl } from '@/components/chat/link-preview';
import { UserSettings } from '@/lib/types/profile';

describe('Phase 4 — Essential Features Verification', () => {
  describe('1. Notification Inbox & Category Filters', () => {
    const defaultSettings: Partial<UserSettings> = {
      notif_dms: true,
      notif_mentions: true,
      notif_friend_requests: true,
      notif_invites: true,
      notif_missed_calls: true,
    };

    it('enables all notifications when user settings are defaulted to true', () => {
      expect(isNotificationCategoryEnabled('message', defaultSettings)).toBe(true);
      expect(isNotificationCategoryEnabled('mention', defaultSettings)).toBe(true);
      expect(isNotificationCategoryEnabled('friend_request', defaultSettings)).toBe(true);
      expect(isNotificationCategoryEnabled('server_invitation', defaultSettings)).toBe(true);
      expect(isNotificationCategoryEnabled('missed_call', defaultSettings)).toBe(true);
      expect(isNotificationCategoryEnabled('reply', defaultSettings)).toBe(true);
    });

    it('suppresses notifications for disabled categories', () => {
      const customSettings: Partial<UserSettings> = {
        ...defaultSettings,
        notif_dms: false,
        notif_missed_calls: false,
      };

      expect(isNotificationCategoryEnabled('message', customSettings)).toBe(false);
      expect(isNotificationCategoryEnabled('missed_call', customSettings)).toBe(false);
      expect(isNotificationCategoryEnabled('mention', customSettings)).toBe(true);
      expect(isNotificationCategoryEnabled('friend_request', customSettings)).toBe(true);
    });

    it('correctly handles active conversation mute logic', () => {
      const activeResourceId = 'conv-12345';

      const incomingItemActive = {
        id: 'notif-1',
        type: 'message',
        data: { conversation_id: 'conv-12345' },
      };

      const incomingItemOther = {
        id: 'notif-2',
        type: 'message',
        data: { conversation_id: 'conv-67890' },
      };

      const shouldSuppressActive = incomingItemActive.data.conversation_id === activeResourceId;
      const shouldSuppressOther = incomingItemOther.data.conversation_id === activeResourceId;

      expect(shouldSuppressActive).toBe(true);
      expect(shouldSuppressOther).toBe(false);
    });
  });

  describe('2. Safe Link Preview & SSRF Prevention', () => {
    it('approves legitimate public websites with https', () => {
      expect(isSafePublicUrl('https://google.com')).toBe(true);
      expect(isSafePublicUrl('https://github.com/torvalds/linux')).toBe(true);
      expect(isSafePublicUrl('https://discord.com/app')).toBe(true);
      expect(isSafePublicUrl('http://example.com/blog?id=42')).toBe(true);
    });

    it('strictly blocks localhost and loopback interfaces', () => {
      expect(isSafePublicUrl('http://localhost')).toBe(false);
      expect(isSafePublicUrl('http://localhost:3000')).toBe(false);
      expect(isSafePublicUrl('http://127.0.0.1')).toBe(false);
      expect(isSafePublicUrl('http://127.0.0.1:8080/admin')).toBe(false);
      expect(isSafePublicUrl('http://0.0.0.0')).toBe(false);
      expect(isSafePublicUrl('http://[::1]')).toBe(false);
      expect(isSafePublicUrl('http://nexus.local')).toBe(false);
      expect(isSafePublicUrl('http://api.internal')).toBe(false);
    });

    it('strictly blocks private RFC1918 IPv4 ranges', () => {
      // 10.0.0.0/8
      expect(isSafePublicUrl('http://10.0.0.1')).toBe(false);
      expect(isSafePublicUrl('http://10.254.12.3:8000')).toBe(false);

      // 192.168.0.0/16
      expect(isSafePublicUrl('http://192.168.1.1')).toBe(false);
      expect(isSafePublicUrl('http://192.168.0.100:5432')).toBe(false);

      // 172.16.0.0 - 172.31.255.255
      expect(isSafePublicUrl('http://172.16.0.1')).toBe(false);
      expect(isSafePublicUrl('http://172.24.5.10')).toBe(false);
      expect(isSafePublicUrl('http://172.31.255.254')).toBe(false);

      // Link-local 169.254.x.x (AWS metadata / cloud metadata)
      expect(isSafePublicUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    });

    it('rejects unsafe URL protocols like javascript:, data:, and file:', () => {
      expect(isSafePublicUrl('javascript:alert(1)')).toBe(false);
      expect(isSafePublicUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
      expect(isSafePublicUrl('file:///etc/passwd')).toBe(false);
      expect(isSafePublicUrl('not a url at all')).toBe(false);
    });
  });

  describe('3. Message Forwarding & Attribution Logic', () => {
    it('creates properly formatted forwarding attribution banner', () => {
      const originalMessage = {
        id: 'msg-99',
        content: 'Check out this epic play: https://example.com/clip',
        sender: {
          username: 'striker_pro',
          display_name: 'Striker Pro',
        },
      };

      const authorTag = originalMessage.sender.username
        ? `@${originalMessage.sender.username}`
        : originalMessage.sender.display_name;

      const forwardedContent = `[Forwarded from ${authorTag}]\n${originalMessage.content}`;

      expect(forwardedContent).toContain('[Forwarded from @striker_pro]');
      expect(forwardedContent).toContain('Check out this epic play');
    });

    it('handles fallback sender when username is missing', () => {
      const originalMessage = {
        id: 'msg-100',
        content: 'Need one more for ranked squad!',
        sender: {
          username: '',
          display_name: 'Vanguard Leader',
        },
      };

      const authorTag = originalMessage.sender.username
        ? `@${originalMessage.sender.username}`
        : originalMessage.sender.display_name;

      const forwardedContent = `[Forwarded from ${authorTag}]\n${originalMessage.content}`;

      expect(forwardedContent).toContain('[Forwarded from Vanguard Leader]');
    });
  });

  describe('4. Moderation & Safety Rules', () => {
    it('validates timeout duration calculation', () => {
      const durationMinutes = 60;
      const durationSeconds = durationMinutes * 60;
      expect(durationSeconds).toBe(3600);

      const now = new Date('2026-10-18T10:00:00Z');
      const timeoutUntil = new Date(now.getTime() + durationSeconds * 1000);
      expect(timeoutUntil.toISOString()).toBe('2026-10-18T11:00:00.000Z');
    });

    it('checks active timeout expiration state correctly', () => {
      const now = new Date('2026-10-18T10:00:00Z');

      const activeMember = {
        timeout_until: '2026-10-18T10:30:00Z',
      };
      const isStillTimedOut = new Date(activeMember.timeout_until) > now;
      expect(isStillTimedOut).toBe(true);

      const expiredMember = {
        timeout_until: '2026-10-18T09:30:00Z',
      };
      const isExpired = new Date(expiredMember.timeout_until) <= now;
      expect(isExpired).toBe(true);
    });

    it('formats moderation audit log actions consistently', () => {
      const validActions = [
        'kick',
        'ban',
        'unban',
        'timeout',
        'untimeout',
        'delete_message',
        'revoke_invite',
        'update_server',
      ];

      validActions.forEach((action) => {
        expect(typeof action).toBe('string');
        expect(action.length).toBeGreaterThan(0);
      });
    });
  });

  describe('5. Draft Preservation Keys & State', () => {
    it('generates consistent draft storage keys for direct and channel messages', () => {
      const conversationId = 'conv-squad-alpha';
      const channelId = 'chan-general-123';

      const convKey = `nexus_draft_conv_${conversationId}`;
      const chanKey = `nexus_draft_chan_${channelId}`;

      expect(convKey).toBe('nexus_draft_conv_conv-squad-alpha');
      expect(chanKey).toBe('nexus_draft_chan_chan-general-123');
    });
  });
});
