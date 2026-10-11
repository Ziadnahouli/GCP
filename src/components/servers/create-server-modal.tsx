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
      <div className="relative w-full max-w-lg rounded-2xl border border-border/80 bg-surface-default p-6 shadow-2xl z-10 animate-in zoom-in-95 duration-150 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
              <Gamepad2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Create Your Server</h3>
              <p className="text-xs text-muted-foreground">
                Your server is where you and your gaming squad talk and play.
              </p>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-surface-hover"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Template Selectors */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Start from a Template
          </label>
          <div className="grid gap-2">
            {templates.map((tmpl) => {
              const Icon = tmpl.icon;
              const isSelected = selectedTemplate === tmpl.id;

              return (
                <div
                  key={tmpl.id}
                  onClick={() => handleSelectTemplate(tmpl)}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer',
                    isSelected
                      ? 'border-primary bg-primary/10 shadow-glow-sm'
                      : 'border-border/60 bg-surface-sidebar/60 hover:bg-surface-hover'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center',
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-surface-default text-muted-foreground'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-foreground">{tmpl.title}</div>
                      <div className="text-[11px] text-muted-foreground">{tmpl.desc}</div>
                    </div>
                  </div>

                  {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Inputs */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Server Name
            </label>
            <input
              type="text"
              required
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="e.g. Tactical Squad Alpha"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface-sidebar text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Server Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What games does your squad play?"
              className="w-full px-3.5 py-2 rounded-xl border border-border bg-surface-sidebar text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary resize-none shadow-inner"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="subtle"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={submitting || !serverName.trim()}
              className="font-bold px-5"
            >
              {submitting ? 'Creating...' : 'Create Server'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
