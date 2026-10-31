'use client';

import * as React from 'react';
import { ProfileLinkItem } from '@/lib/types/profile';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';

interface LinksEditorProps {
  links: ProfileLinkItem[];
  onChange: (links: ProfileLinkItem[]) => void;
}

export const LinksEditor: React.FC<LinksEditorProps> = ({ links, onChange }) => {
  const [newLabel, setNewLabel] = React.useState('');
  const [newUrl, setNewUrl] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const handleAddLink = () => {
    setError(null);
    const trimmedLabel = newLabel.trim();
    const trimmedUrl = newUrl.trim();

    if (!trimmedLabel) {
      setError('Please provide a label for your link.');
      return;
    }
    if (trimmedLabel.length > 30) {
      setError('Link label cannot exceed 30 characters.');
      return;
    }
    if (!trimmedUrl.startsWith('https://')) {
      setError('Link URL must start with https:// for security.');
      return;
    }
    if (trimmedUrl.length > 200) {
      setError('Link URL cannot exceed 200 characters.');
      return;
    }
    if (links.length >= 5) {
      setError('A profile cannot have more than 5 custom links.');
      return;
    }

    const newItem: ProfileLinkItem = {
      id: `temp-${Date.now()}`,
      user_id: '',
      label: trimmedLabel,
      url: trimmedUrl,
      position: links.length,
    };

    onChange([...links, newItem]);
    setNewLabel('');
    setNewUrl('');
  };

  const handleRemoveLink = (index: number) => {
    const updated = links
      .filter((_, i) => i !== index)
      .map((item, idx) => ({ ...item, position: idx }));
    onChange(updated);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= links.length) return;

    const copy = [...links];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);

    const reindexed = copy.map((item, idx) => ({ ...item, position: idx }));
    onChange(reindexed);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-foreground">
          Custom Links ({links.length}/5)
        </label>
        <span className="text-[11px] text-muted-foreground">HTTPS URLs only</span>
      </div>

      {/* Existing Links List */}
      <div className="space-y-2">
        {links.map((link, idx) => (
          <div
            key={link.id || idx}
            className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-surface-default hover:bg-surface-hover transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-xs text-foreground truncate">{link.label}</div>
              <div className="text-[11px] text-muted-foreground font-mono truncate">{link.url}</div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleMove(idx, 'up')}
                disabled={idx === 0}
                className="h-7 w-7 p-0"
                title="Move up"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleMove(idx, 'down')}
                disabled={idx === links.length - 1}
                className="h-7 w-7 p-0"
                title="Move down"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleRemoveLink(idx)}
                className="h-7 w-7 p-0 text-danger hover:text-danger hover:bg-danger/10"
                title="Remove link"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Add New Link Inputs */}
      {links.length < 5 && (
        <div className="p-3 rounded-xl border border-border/70 bg-muted/40 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (e.g., GitHub, Portfolio)"
              maxLength={30}
              className="text-xs h-8"
            />
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com"
              maxLength={200}
              className="text-xs h-8 font-mono"
            />
          </div>

          {error && <div className="text-xs text-danger font-medium">{error}</div>}

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleAddLink}
            className="w-full text-xs h-8 gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Link
          </Button>
        </div>
      )}
    </div>
  );
};

