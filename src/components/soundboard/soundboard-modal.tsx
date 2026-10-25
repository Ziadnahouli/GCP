'use client';

import * as React from 'react';
import {
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Sparkles,
  Keyboard,
  Radio,
  UploadCloud,
  CheckCircle2,
  Music,
  X,
} from 'lucide-react';
import { useSoundboard } from '@/hooks/use-soundboard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Kbd } from '@/components/ui/kbd';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface SoundboardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isInCall?: boolean;
}

export function SoundboardModal({
  open,
  onOpenChange,
  isInCall = false,
}: SoundboardModalProps) {
  const {
    filteredClips,
    playingClipId,
    volume,
    setVolume,
    playClip,
    stopAll,
    addCustomClip,
    removeCustomClip,
    activeCategory,
    setActiveCategory,
    hotkeysEnabled,
    setHotkeysEnabled,
  } = useSoundboard();

  const { toast } = useToast();
  const [showUploadModal, setShowUploadModal] = React.useState(false);
  const [uploadName, setUploadName] = React.useState('');
  const [uploadCategory, setUploadCategory] = React.useState<'memes' | 'combat' | 'callouts' | 'custom'>('custom');
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [uploadDataUri, setUploadDataUri] = React.useState<string | null>(null);
  const [uploadDuration, setUploadDuration] = React.useState<number>(0);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      setUploadError('Only audio files (MP3, WAV, OGG, WebM) are permitted.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Audio file must be under 5MB.');
      return;
    }

    setUploadError(null);
    setUploadFile(file);
    if (!uploadName) {
      setUploadName(file.name.replace(/\.[^/.]+$/, ''));
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      setUploadDataUri(dataUri);

      const audio = new Audio();
      audio.src = dataUri;
      audio.onloadedmetadata = () => {
        if (audio.duration > 10.5) {
          setUploadError('Audio clip duration must be 10 seconds or less.');
          setUploadDataUri(null);
        } else {
          setUploadDuration(Math.round(audio.duration * 10) / 10);
        }
      };
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCustomSound = () => {
    if (!uploadName.trim() || !uploadDataUri) {
      setUploadError('Please select a valid audio clip and enter a name.');
      return;
    }

    addCustomClip(uploadName.trim(), uploadCategory, uploadDataUri, uploadDuration || 3.0);
    toast({
      title: 'Sound clip added',
      description: `"${uploadName}" is ready to play.`,
      type: 'success',
    });

    setShowUploadModal(false);
    setUploadFile(null);
    setUploadDataUri(null);
    setUploadName('');
    setUploadDuration(0);
    setUploadError(null);
  };

  const categories = [
    { id: 'all', label: 'All sounds' },
    { id: 'memes', label: 'Memes' },
    { id: 'combat', label: 'Combat & SFX' },
    { id: 'callouts', label: 'Callouts' },
    { id: 'custom', label: 'My uploads' },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between pr-6">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-control bg-primary-subtle text-primary flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <DialogTitle>Soundboard</DialogTitle>
                    {isInCall && (
                      <Badge variant="accent" className="text-xs px-1.5 py-0">
                        <Radio className="w-3 h-3 mr-1 animate-pulse" />
                        In call
                      </Badge>
                    )}
                  </div>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Audio effects and custom clips with global keyboard hotkeys.
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Controls & Filter Bar */}
          <div className="px-5 py-2.5 border-b border-border bg-surface-sidebar flex flex-wrap items-center justify-between gap-2 select-none">
            {/* Categories */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-control text-xs transition-colors shrink-0',
                    activeCategory === cat.id
                      ? 'bg-card text-foreground font-semibold border border-border shadow-sm'
                      : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Volume & Action Controls */}
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-2 bg-card px-2.5 py-1 rounded-control border border-border">
                <button
                  onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
                  className="text-muted-foreground hover:text-foreground"
                  title={volume > 0 ? 'Mute' : 'Unmute'}
                  aria-label={volume > 0 ? 'Mute soundboard' : 'Unmute soundboard'}
                >
                  {volume > 0 ? <Volume2 className="w-3.5 h-3.5 text-primary" /> : <VolumeX className="w-3.5 h-3.5 text-danger" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-16 h-1 accent-primary bg-surface-hover rounded cursor-pointer"
                  title={`Volume: ${Math.round(volume * 100)}%`}
                  aria-label="Soundboard volume"
                />
                <span className="text-xs text-muted-foreground w-6 font-mono text-right">
                  {Math.round(volume * 100)}%
                </span>
              </div>

              <Button
                variant={hotkeysEnabled ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setHotkeysEnabled(!hotkeysEnabled)}
                className="h-7 text-xs gap-1.5"
                title="Toggle 1-9 keyboard hotkeys"
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>Keys 1-9</span>
              </Button>

              {playingClipId && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={stopAll}
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Stop</span>
                </Button>
              )}

              <Button
                variant="primary"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowUploadModal(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add sound</span>
              </Button>
            </div>
          </div>

          {/* Sound Clips Grid */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {filteredClips.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Music className="w-8 h-8 text-muted-foreground mx-auto" />
                <div className="text-xs font-semibold text-foreground">No sound clips found</div>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  No sounds in this category. Click &quot;Add sound&quot; above to upload a custom clip.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {filteredClips.map((clip) => {
                  const isPlaying = playingClipId === clip.id;

                  return (
                    <div
                      key={clip.id}
                      className={cn(
                        'group relative rounded-card border p-3 flex flex-col justify-between transition-colors select-none cursor-pointer',
                        isPlaying
                          ? 'border-primary bg-primary-subtle'
                          : 'border-border bg-card hover:bg-surface-hover'
                      )}
                      onClick={() => playClip(clip)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-xl shrink-0">{clip.icon}</span>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                              {clip.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {clip.durationSeconds}s
                            </div>
                          </div>
                        </div>

                        {clip.hotkey && (
                          <Kbd>{clip.hotkey}</Kbd>
                        )}
                      </div>

                      {/* Equalizer & Action */}
                      <div className="mt-3 pt-2 border-t border-border flex items-center justify-between">
                        {isPlaying ? (
                          <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            <span>Playing</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground group-hover:text-foreground">
                            Play sound
                          </span>
                        )}

                        {clip.type === 'custom' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCustomClip(clip.id);
                            }}
                            className="text-muted-foreground hover:text-danger p-0.5 rounded-control transition-colors"
                            title="Delete custom clip"
                            aria-label={`Delete ${clip.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-5 py-2.5 border-t border-border bg-surface-sidebar flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-primary" />
              <span>Sounds mix directly into active call audio.</span>
            </div>
            <span>Esc closes soundboard</span>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Custom Sound Dialog */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add custom sound</DialogTitle>
            <DialogDescription>
              Upload an audio clip (MP3, WAV, OGG, max 10 seconds, 5MB).
            </DialogDescription>
          </DialogHeader>

          <input
            type="file"
            ref={fileInputRef}
            accept="audio/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-control p-5 text-center cursor-pointer transition-colors',
              uploadFile
                ? 'border-status-online bg-primary-subtle'
                : 'border-border hover:border-primary/50 bg-surface-hover'
            )}
          >
            {uploadFile ? (
              <div className="flex items-center justify-center gap-2 text-status-online font-medium text-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span className="truncate max-w-[200px]">{uploadFile.name}</span>
                <span className="text-muted-foreground font-mono">({uploadDuration}s)</span>
              </div>
            ) : (
              <div className="space-y-1">
                <UploadCloud className="w-6 h-6 text-muted-foreground mx-auto" />
                <div className="text-xs font-semibold text-foreground">
                  Click to select audio file
                </div>
                <div className="text-xs text-muted-foreground">
                  MP3, WAV, OGG (Max 10s, 5MB)
                </div>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="text-xs text-danger font-medium">{uploadError}</div>
          )}

          <div className="space-y-3 pt-2">
            <div>
              <label htmlFor="sound-upload-name" className="text-xs font-medium text-foreground block mb-1">
                Sound name
              </label>
              <Input
                id="sound-upload-name"
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g. Victory horn"
              />
            </div>

            <div>
              <label htmlFor="sound-upload-cat" className="text-xs font-medium text-foreground block mb-1">
                Category
              </label>
              <select
                id="sound-upload-cat"
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value as typeof uploadCategory)}
                className="w-full px-3 py-1.5 rounded-control border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="memes">Memes</option>
                <option value="combat">Combat & SFX</option>
                <option value="callouts">Callouts</option>
                <option value="custom">My uploads</option>
              </select>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowUploadModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!uploadFile || !uploadName.trim() || !!uploadError}
              onClick={handleSaveCustomSound}
            >
              Save sound
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
