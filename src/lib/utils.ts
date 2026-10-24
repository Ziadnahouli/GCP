import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function truncate(str: string, length: number): string {
  if (!str || str.length <= length) return str;
  return `${str.slice(0, length)}...`;
}

/**
 * Adds an item to a Set, enforcing a maximum size with FIFO eviction.
 */
export function addBoundedSet<T>(set: Set<T>, item: T, maxSize = 1000): void {
  if (set.has(item)) return;
  if (set.size >= maxSize) {
    const oldest = set.values().next().value;
    if (oldest !== undefined) {
      set.delete(oldest);
    }
  }
  set.add(item);
}

/**
 * Sets a key-value pair in a Map, enforcing a maximum size with FIFO eviction.
 */
export function setBoundedMap<K, V>(map: Map<K, V>, key: K, value: V, maxSize = 1000): void {
  if (map.has(key)) {
    map.set(key, value);
    return;
  }
  if (map.size >= maxSize) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) {
      map.delete(oldest);
    }
  }
  map.set(key, value);
}
