'use client';

import * as React from 'react';
import { Search, Clock, Smile, Compass, Coffee, Trophy, Car, Lightbulb, Heart, X } from 'lucide-react';
import {
  EMOJI_CATEGORIES,
  searchEmojis,
  getRecentEmojis,
  saveRecentEmoji,
  EmojiItem,
} from '@/lib/emoji/emoji-data';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  trigger?: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  recent: <Clock className="w-4 h-4" />,
  smileys: <Smile className="w-4 h-4" />,
  people: <Compass className="w-4 h-4" />,
  animals: <span className="text-xs">🐶</span>,
  food: <Coffee className="w-4 h-4" />,
  activities: <Trophy className="w-4 h-4" />,
  travel: <Car className="w-4 h-4" />,
  objects: <Lightbulb className="w-4 h-4" />,
  symbols: <Heart className="w-4 h-4" />,
};

export function EmojiPickerContent({
  onSelectEmoji,
  onClose,
}: {
  onSelectEmoji: (emoji: string) => void;
  onClose?: () => void;
}) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeCategory, setActiveCategory] = React.useState<string>('smileys');
  const [recents, setRecents] = React.useState<string[]>([]);
  const [focusedIndex, setFocusedIndex] = React.useState<number>(-1);

  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const categoryRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  React.useEffect(() => {
    setRecents(getRecentEmojis());
  }, []);

  const filteredEmojis = React.useMemo(() => {
    if (!searchQuery.trim()) return null;
    return searchEmojis(searchQuery);
  }, [searchQuery]);

  const handleSelect = React.useCallback(
    (char: string) => {
      saveRecentEmoji(char);
      setRecents(getRecentEmojis());
      onSelectEmoji(char);
      onClose?.();
    },
    [onSelectEmoji, onClose]
  );

  const scrollToCategory = (catId: string) => {
    setActiveCategory(catId);
    const el = categoryRefs.current[catId];
    if (el && scrollContainerRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Keyboard navigation within the emoji grid
  const currentGridEmojis = React.useMemo(() => {
    if (filteredEmojis) return filteredEmojis.map((e) => e.char);
    const list: string[] = [];
    if (recents.length > 0) list.push(...recents);
    for (const cat of EMOJI_CATEGORIES) {
      list.push(...cat.emojis.map((e) => e.char));
    }
    return list;
  }, [filteredEmojis, recents]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const cols = 8;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + 1, currentGridEmojis.length - 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + cols, currentGridEmojis.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - cols, 0));
    } else if (e.key === 'Enter' && focusedIndex >= 0 && focusedIndex < currentGridEmojis.length) {
      e.preventDefault();
      handleSelect(currentGridEmojis[focusedIndex]);
    } else if (e.key === 'Escape') {
      onClose?.();
    }
  };

  return (
    <div
      className="flex flex-col w-[320px] sm:w-[350px] h-[380px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden select-none"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-label="Emoji Picker"
    >
      {/* Search Header */}
      <div className="p-2.5 border-b border-border/60 bg-muted/30">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 absolute left-2.5 text-muted-foreground pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setFocusedIndex(-1);
            }}
            placeholder="Search emoji..."
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-surface border border-border/80 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs (hidden during search) */}
      {!filteredEmojis && (
        <div className="flex items-center justify-between px-2 py-1 border-b border-border/40 bg-muted/20 text-muted-foreground overflow-x-auto no-scrollbar">
          {recents.length > 0 && (
            <button
              type="button"
              onClick={() => scrollToCategory('recent')}
              className={cn(
                'p-1.5 rounded-lg hover:text-foreground hover:bg-surface-hover transition-colors',
                activeCategory === 'recent' && 'text-primary bg-primary/10'
              )}
              title="Recently Used"
              aria-label="Recently Used"
            >
              {CATEGORY_ICONS.recent}
            </button>
          )}
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => scrollToCategory(cat.id)}
              className={cn(
                'p-1.5 rounded-lg hover:text-foreground hover:bg-surface-hover transition-colors text-xs',
                activeCategory === cat.id && 'text-primary bg-primary/10'
              )}
              title={cat.name}
              aria-label={cat.name}
            >
              {CATEGORY_ICONS[cat.id] || cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji Scroll Grid */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-2 space-y-3 overscroll-contain"
      >
        {filteredEmojis ? (
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground px-1 mb-1.5">
              Search Results ({filteredEmojis.length})
            </div>
            {filteredEmojis.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No emojis found for &quot;{searchQuery}&quot;
              </div>
            ) : (
              <div className="grid grid-cols-8 gap-1">
                {filteredEmojis.map((emoji, idx) => (
                  <button
                    key={`${emoji.char}-${idx}`}
                    type="button"
                    onClick={() => handleSelect(emoji.char)}
                    className={cn(
                      'w-8 h-8 flex items-center justify-center text-xl rounded-md hover:bg-surface-hover hover:scale-110 active:scale-95 transition-transform duration-75',
                      focusedIndex === idx && 'bg-primary/20 ring-1 ring-primary'
                    )}
                    title={`${emoji.name} (${emoji.shortcode})`}
                    aria-label={emoji.name}
                  >
                    {emoji.char}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Recents Section */}
            {recents.length > 0 && (
              <div
                ref={(el) => {
                  categoryRefs.current['recent'] = el;
                }}
              >
                <div className="text-[11px] font-semibold text-muted-foreground px-1 mb-1">
                  Recently Used
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {recents.map((char, idx) => (
                    <button
                      key={`recent-${char}-${idx}`}
                      type="button"
                      onClick={() => handleSelect(char)}
                      className={cn(
                        'w-8 h-8 flex items-center justify-center text-xl rounded-md hover:bg-surface-hover hover:scale-110 active:scale-95 transition-transform duration-75',
                        focusedIndex === idx && 'bg-primary/20 ring-1 ring-primary'
                      )}
                      aria-label={char}
                    >
                      {char}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Category Sections */}
            {EMOJI_CATEGORIES.map((cat) => (
              <div
                key={cat.id}
                ref={(el) => {
                  categoryRefs.current[cat.id] = el;
                }}
              >
                <div className="text-[11px] font-semibold text-muted-foreground px-1 mb-1">
                  {cat.name}
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {cat.emojis.map((emoji) => (
                    <button
                      key={emoji.shortcode}
                      type="button"
                      onClick={() => handleSelect(emoji.char)}
                      className="w-8 h-8 flex items-center justify-center text-xl rounded-md hover:bg-surface-hover hover:scale-110 active:scale-95 transition-transform duration-75"
                      title={`${emoji.name} (${emoji.shortcode})`}
                      aria-label={emoji.name}
                    >
                      {emoji.char}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export function EmojiPicker({
  onSelectEmoji,
  trigger,
  align = 'end',
  side = 'top',
  sideOffset = 8,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: EmojiPickerProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (!isControlled) setInternalOpen(val);
    controlledOnOpenChange?.(val);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {trigger && <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      <PopoverContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className="p-0 border-none bg-transparent shadow-none w-auto z-dropdown"
      >
        <EmojiPickerContent
          onSelectEmoji={(emoji) => {
            onSelectEmoji(emoji);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
