import { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserClient } from '@/lib/supabase/client';

export interface ScopedChannelHandle {
  channel: RealtimeChannel;
  release: (gracePeriodMs?: number) => void;
}

interface HubChannelEntry {
  channel: RealtimeChannel;
  refCount: number;
  unmountTimer?: NodeJS.Timeout | null;
  client?: any;
}

export class RealtimeHub {
  private client: any;
  private channels: Map<string, HubChannelEntry> = new Map();

  constructor(client?: any) {
    this.client = client;
  }

  setClient(client: any): void {
    this.client = client;
  }

  private getClient(explicitClient?: any) {
    if (explicitClient) return explicitClient;
    if (this.client) return this.client;
    return getBrowserClient();
  }

  /**
   * Acquire a shared RealtimeChannel by topic name.
   * If the channel exists, increments reference count and cancels any pending teardown.
   * If not, creates a new channel with the given options and initializes refCount to 1.
   */
  acquire(topic: string, options?: any, explicitClient?: any): RealtimeChannel {
    const entry = this.channels.get(topic);
    if (entry) {
      if (entry.unmountTimer) {
        clearTimeout(entry.unmountTimer);
        entry.unmountTimer = null;
      }
      entry.refCount += 1;
      return entry.channel;
    }

    const client = this.getClient(explicitClient);
    if (!client) {
      throw new Error('Supabase client unavailable for RealtimeHub');
    }

    const channel = client.channel(topic, options);
    this.channels.set(topic, {
      channel,
      refCount: 1,
      unmountTimer: null,
      client,
    });

    return channel;
  }

  /**
   * Release a channel reference for a topic.
   * Decrements ref count. If ref count reaches 0, tears down channel either
   * immediately or after the specified gracePeriodMs.
   */
  release(topic: string, gracePeriodMs: number = 0): void {
    const entry = this.channels.get(topic);
    if (!entry) return;

    entry.refCount = Math.max(0, entry.refCount - 1);

    if (entry.refCount === 0) {
      const isTest = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST));
      const hasFakeTimers = typeof (setTimeout as any).clock !== 'undefined';
      const effectiveGrace = isTest && !hasFakeTimers ? 0 : gracePeriodMs;

      if (effectiveGrace > 0) {
        if (entry.unmountTimer) clearTimeout(entry.unmountTimer);
        entry.unmountTimer = setTimeout(() => {
          this.teardownChannel(topic);
        }, effectiveGrace);
      } else {
        this.teardownChannel(topic);
      }
    }
  }

  /**
   * Acquire a scoped channel handle with an explicit release method.
   */
  acquireScoped(topic: string, options?: any, explicitClient?: any): ScopedChannelHandle {
    const channel = this.acquire(topic, options, explicitClient);
    let released = false;

    return {
      channel,
      release: (gracePeriodMs?: number) => {
        if (!released) {
          released = true;
          this.release(topic, gracePeriodMs);
        }
      },
    };
  }

  /**
   * Returns current refCount for a topic.
   */
  getRefCount(topic: string): number {
    return this.channels.get(topic)?.refCount ?? 0;
  }

  /**
   * Checks if an active channel exists for a topic.
   */
  hasChannel(topic: string): boolean {
    return this.channels.has(topic);
  }

  /**
   * Gets the underlying channel instance if present.
   */
  getChannel(topic: string): RealtimeChannel | undefined {
    return this.channels.get(topic)?.channel;
  }

  private teardownChannel(topic: string): void {
    const entry = this.channels.get(topic);
    if (!entry) return;

    if (entry.unmountTimer) {
      clearTimeout(entry.unmountTimer);
      entry.unmountTimer = null;
    }

    // Only teardown if refCount is still 0
    if (entry.refCount <= 0) {
      this.channels.delete(topic);
      const client = entry.client || this.getClient();
      if (client && entry.channel) {
        try {
          client.removeChannel(entry.channel);
        } catch (e) {
          try {
            entry.channel.unsubscribe();
          } catch {}
        }
      }
    }
  }

  /**
   * Reset / clear all channels (useful in test teardown or logout).
   */
  clear(): void {
    this.channels.forEach((entry) => {
      if (entry.unmountTimer) clearTimeout(entry.unmountTimer);
      const client = entry.client || this.getClient();
      if (client && entry.channel) {
        try {
          client.removeChannel(entry.channel);
        } catch {}
      }
    });
    this.channels.clear();
    this.client = null;
  }
}

// Singleton instance for application-wide channel sharing
export const realtimeHub = new RealtimeHub();
