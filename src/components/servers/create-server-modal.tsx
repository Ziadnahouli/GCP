'use client';

import * as React from 'react';
import {
  Shield,
  Gamepad2,
  Users,
  Sparkles,
  X,
  Plus,
  Radio,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CreateServerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateServer: (name: string, description?: string) => Promise<unknown>;
}

export function CreateServerModal({
  open,
  onOpenChange,
  onCreateServer,
}: CreateServerModalProps) {
  const [selectedTemplate, setSelectedTemplate] = React.useState<'competitive' | 'hangout' | 'custom'>('competitive');
  const [serverName, setServerName] = React.useState('Tactical Squad Bravo');
  const [description, setDescription] = React.useState('Competitive squad for ranked grinds and tactical comms.');
  const [submitting, setSubmitting] = React.useState(false);

  if (!open) return null;

  const templates = [
    {
      id: 'competitive' as const,
      title: 'Gaming & Competitive Scrims',
      desc: 'Optimized for tactical FPS squads, map callouts & scrim comms.',
      icon: Shield,
      defaultName: 'Apex Scrim Clan',
      defaultDesc: 'Official headquarters for ranked scrims, strats, and tournament matches.',
    },
    {
      id: 'hangout' as const,
      title: 'Squad Hangout & Friends',
      desc: 'Relaxed hangout with casual voice lounges and gaming banter.',
      icon: Users,
      defaultName: 'The Gamer Den',
      defaultDesc: 'Casual squad lounge for weekend gaming sessions and memes.',
    },
    {
      id: 'custom' as const,
      title: 'Create My Own',
      desc: 'Customize channels and roles from a blank canvas.',
      icon: Sparkles,
      defaultName: 'My Clan',
      defaultDesc: '',
    },
  ];

  const handleSelectTemplate = (tmpl: typeof templates[0]) => {
    setSelectedTemplate(tmpl.id);
    setServerName(tmpl.defaultName);
    setDescription(tmpl.defaultDesc);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverName.trim()) return;

    setSubmitting(true);
    try {
      await onCreateServer(serverName.trim(), description.trim());
      onOpenChange(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-md animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg rounded-2xl border border-white/[0.08] bg-surface-panel p-4 sm:p-6 shadow-2xl shadow-black/90 z-10 animate-in zoom-in-95 duration-150 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center text-primary">
              <Gamepad2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Create Your Server</h3>
              <p className="text-xs text-muted-foreground/70">
                Your server is where you and your gaming squad talk and play.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close dialog"
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-white/[0.04] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Template Selectors */}
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Start from a Template
          </div>
          <div className="grid gap-2">
            {templates.map((tmpl) => {
              const Icon = tmpl.icon;
              const isSelected = selectedTemplate === tmpl.id;

              return (
                <button
                  type="button"
                  key={tmpl.id}
                  onClick={() => handleSelectTemplate(tmpl)}
                  className={cn(
                    'w-full text-left flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer',
                    isSelected
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-md flex items-center justify-center',
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-white/[0.04] text-muted-foreground'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-foreground">{tmpl.title}</div>
                      <div className="text-[11px] text-muted-foreground/60">{tmpl.desc}</div>
                    </div>
                  </div>

                  {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Form Inputs */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div>
            <label htmlFor="create-server-name" className="text-xs font-medium text-foreground block mb-1">
              Server Name
            </label>
            <input
              id="create-server-name"
              type="text"
              required
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="e.g. Tactical Squad Alpha"
              aria-label="Server Name"
              className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-foreground text-xs focus:outline-none focus:border-white/[0.2] transition-colors"
            />
          </div>

          <div>
            <label htmlFor="create-server-desc" className="text-xs font-medium text-foreground block mb-1">
              Server Description (Optional)
            </label>
            <textarea
              id="create-server-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What games does your squad play?"
              aria-label="Server Description (Optional)"
              className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-foreground text-xs focus:outline-none focus:border-white/[0.2] resize-none transition-colors"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] text-xs font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={submitting || !serverName.trim()}
              className="font-medium px-4 text-xs"
            >
              {submitting ? 'Creating...' : 'Create Server'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
