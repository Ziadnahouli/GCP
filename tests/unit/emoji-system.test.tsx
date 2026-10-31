import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  EMOJI_CATEGORIES,
  searchEmojis,
  findShortcodeMatches,
  isEmojiOnlyMessage,
  getRecentEmojis,
  saveRecentEmoji,
  EmojiItem,
} from '@/lib/emoji/emoji-data';
import { EmojiPickerContent } from '@/components/ui/emoji-picker/EmojiPicker';

describe('Emoji Data and Utilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('provides comprehensive emoji categories with items', () => {
    expect(EMOJI_CATEGORIES.length).toBeGreaterThan(5);
    const categoryNames = EMOJI_CATEGORIES.map((c) => c.name);
    expect(categoryNames).toContain('Smileys & Emotion');
    expect(categoryNames).toContain('People & Body');
    expect(categoryNames).toContain('Animals & Nature');
    expect(categoryNames).toContain('Food & Drink');
    expect(categoryNames).toContain('Activities');
    expect(categoryNames).toContain('Objects');
    expect(categoryNames).toContain('Symbols');

    for (const cat of EMOJI_CATEGORIES) {
      expect(cat.emojis.length).toBeGreaterThan(0);
      for (const emoji of cat.emojis) {
        expect(emoji.char).toBeTruthy();
        expect(emoji.name).toBeTruthy();
        expect(emoji.shortcode).toBeTruthy();
        expect(Array.isArray(emoji.keywords)).toBe(true);
      }
    }
  });

  it('searches emojis by name, keyword, or shortcode', () => {
    const smileMatches = searchEmojis('smile');
    expect(smileMatches.length).toBeGreaterThan(0);
    expect(smileMatches.some((e) => e.char === '😄' || e.char === '😊' || e.char === '😃')).toBe(true);

    const fireMatches = searchEmojis('fire');
    expect(fireMatches.some((e) => e.char === '🔥')).toBe(true);

    const thumbMatches = searchEmojis('thumbs');
    expect(thumbMatches.some((e) => e.char === '👍')).toBe(true);

    const heartMatches = searchEmojis('heart');
    expect(heartMatches.some((e) => e.char === '❤️')).toBe(true);
  });

  it('finds shortcode matches for autocomplete', () => {
    const matches = findShortcodeMatches('smi');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((m) => m.shortcode.includes('smi'))).toBe(true);

    const fireMatch = findShortcodeMatches('fir');
    expect(fireMatch.some((m) => m.shortcode === ':fire:')).toBe(true);

    const empty = findShortcodeMatches('');
    expect(empty).toEqual([]);
  });

  it('detects emoji-only messages for enlargement (1 to 3 emojis)', () => {
    expect(isEmojiOnlyMessage('👍')).toEqual({ isEmojiOnly: true, count: 1 });
    expect(isEmojiOnlyMessage('🔥❤️')).toEqual({ isEmojiOnly: true, count: 2 });
    expect(isEmojiOnlyMessage('🔥 👍 ❤️')).toEqual({ isEmojiOnly: true, count: 3 });
    expect(isEmojiOnlyMessage('   🚀   ')).toEqual({ isEmojiOnly: true, count: 1 });

    // 4 or more emojis -> not enlarged
    expect(isEmojiOnlyMessage('🔥👍❤️😂')).toEqual({ isEmojiOnly: false, count: 4 });

    // Mixed text and emoji -> false
    expect(isEmojiOnlyMessage('Hello 👍')).toEqual({ isEmojiOnly: false, count: 0 });
    expect(isEmojiOnlyMessage('👍 yes')).toEqual({ isEmojiOnly: false, count: 0 });
    expect(isEmojiOnlyMessage('')).toEqual({ isEmojiOnly: false, count: 0 });
    expect(isEmojiOnlyMessage('    ')).toEqual({ isEmojiOnly: false, count: 0 });
  });

  it('manages recently used emojis in localStorage with LRU behavior', () => {
    expect(getRecentEmojis()).toEqual([]);

    saveRecentEmoji('🔥');
    saveRecentEmoji('👍');
    saveRecentEmoji('❤️');

    let recents = getRecentEmojis();
    expect(recents.slice(0, 3)).toEqual(['❤️', '👍', '🔥']);

    // Re-adding 👍 moves it to the front
    saveRecentEmoji('👍');
    recents = getRecentEmojis();
    expect(recents[0]).toBe('👍');
    expect(recents.filter((e) => e === '👍').length).toBe(1);
  });

  it('renders EmojiPickerContent, supports searching and selecting', () => {
    const handleSelect = vi.fn();
    const handleClose = vi.fn();

    render(<EmojiPickerContent onSelectEmoji={handleSelect} onClose={handleClose} />);

    expect(screen.getByPlaceholderText('Search emoji...')).toBeInTheDocument();

    // Type in search box
    const searchInput = screen.getByPlaceholderText('Search emoji...');
    fireEvent.change(searchInput, { target: { value: 'fire' } });

    // Should find fire emoji
    const fireBtn = screen.getByLabelText('Fire');
    expect(fireBtn).toBeInTheDocument();

    fireEvent.click(fireBtn);
    expect(handleSelect).toHaveBeenCalledWith('🔥');
    expect(handleClose).toHaveBeenCalled();
  });
});
