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
  X,
  UploadCloud,
  CheckCircle2,
  Music,
} from 'lucide-react';
import { useSoundboard } from '@/hooks/use-soundboard';
import { SoundboardClip } from '@/lib/soundboard/audio-engine';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useModalEscape } from '@/hooks/use-modal-escape';
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
  useModalEscape(open, onOpenChange);
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

  if (!open) return null;

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

    // Read audio data and inspect duration
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      setUploadDataUri(dataUri);

      // Check duration using an audio element
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
      title: 'Soundboard Clip Added',
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
    { id: 'all', label: 'All Sounds' },
    { id: 'memes', label: 'Gaming Memes' },
    { id: 'combat', label: 'Combat & SFX' },
    { id: 'callouts', label: 'Tactical Callouts' },
    { id: 'custom', label: 'My Uploads' },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-md transition-opacity animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-surface-panel shadow-2xl shadow-black/90 overflow-hidden flex flex-col max-h-[85vh] z-10 animate-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-3.5 border-b border-white/[0.06] flex items-center justify-between bg-surface-header/70 select-none">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-semibold text-foreground">Gaming Soundboard</h3>
                {isInCall && (
                  <Badge variant="subtle" className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/25 gap-1 px-1.5 py-0">
                    <Radio className="w-2.5 h-2.5 animate-pulse" />
                    In Call
                  </Badge>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground/70 line-clamp-1">
                Audio effects, gaming memes, and custom clips with hotkeys.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close soundboard"
              className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-white/[0.04] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action & Filter Bar */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-white/[0.06] bg-surface-panel flex flex-wrap items-center justify-between gap-2 sm:gap-3 select-none">
          {/* Categories */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs transition-colors shrink-0',
                  activeCategory === cat.id
                    ? 'bg-white/[0.08] text-foreground font-medium'
                    : 'text-muted-foreground/70 hover:bg-white/[0.03] hover:text-foreground'
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Controls: Volume, Hotkeys, Stop All, Upload */}
          <div className="flex items-center gap-2.5 text-xs">
            <div className="flex items-center gap-2 bg-white/[0.02] px-2.5 py-1 rounded-md border border-white/[0.06]">
              <button
                onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
                className="text-muted-foreground hover:text-foreground"
                title={volume > 0 ? 'Mute' : 'Unmute'}
              >
                {volume > 0 ? <Volume2 className="w-3.5 h-3.5 text-primary" /> : <VolumeX className="w-3.5 h-3.5 text-rose-500" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-16 h-1 accent-primary bg-white/[0.08] rounded-lg cursor-pointer"
                title={`Volume: ${Math.round(volume * 100)}%`}
              />
              <span className="text-[10px] font-mono text-muted-foreground/60 w-6">
                {Math.round(volume * 100)}%
              </span>
            </div>

            <button
              onClick={() => setHotkeysEnabled(!hotkeysEnabled)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors',
                hotkeysEnabled
                  ? 'border-primary/40 bg-primary/10 text-primary font-medium'
                  : 'border-white/[0.06] bg-white/[0.02] text-muted-foreground/70'
              )}
              title="Toggle global 1-9 hotkeys"
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>Keys 1-9</span>
            </button>

            {playingClipId && (
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs font-medium gap-1 animate-pulse"
                onClick={stopAll}
              >
                <X className="w-3.5 h-3.5" />
                Stop
              </Button>
            )}

            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs font-medium gap-1"
              onClick={() => setShowUploadModal(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Sound
            </Button>
          </div>
        </div>

        {/* Clips Grid */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {filteredClips.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <Music className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <div className="text-sm font-medium text-foreground">No sound clips found</div>
              <p className="text-xs text-muted-foreground/60 max-w-sm mx-auto">
                No sounds in this category. Click &quot;Add Sound&quot; above to upload your own custom clip!
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
                      'group relative rounded-xl border p-3 flex flex-col justify-between transition-colors select-none cursor-pointer',
                      isPlaying
                        ? 'border-primary/50 bg-primary/10 ring-1 ring-primary/30'
                        : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                    )}
                    onClick={() => playClip(clip)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl drop-shadow-sm">{clip.icon}</span>
                        <div>
                          <div className="text-xs font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                            {clip.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground/60 font-mono">
                            {clip.durationSeconds}s
                          </div>
                        </div>
                      </div>

                      {clip.hotkey && (
                        <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-[10px] font-mono text-muted-foreground/70 shadow-sm">
                          {clip.hotkey}
                        </kbd>
                      )}
                    </div>

                    {/* Animated Waveform Equalizer when playing */}
                    <div className="mt-3 pt-2 border-t border-white/[0.06] flex items-center justify-between">
                      {isPlaying ? (
                        <div className="flex items-end gap-1 h-3.5">
                          <span className="w-1 bg-primary rounded-full animate-bounce [animation-delay:0ms] h-3.5" />
                          <span className="w-1 bg-primary rounded-full animate-bounce [animation-delay:150ms] h-2" />
                          <span className="w-1 bg-primary rounded-full animate-bounce [animation-delay:300ms] h-3" />
                          <span className="w-1 bg-primary rounded-full animate-bounce [animation-delay:75ms] h-2.5" />
                          <span className="text-[10px] font-medium text-primary ml-1.5 uppercase font-mono">
                            Playing
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-mono text-muted-foreground/60 group-hover:text-foreground/80">
                          Click to Play
                        </span>
                      )}

                      {clip.type === 'custom' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCustomClip(clip.id);
                          }}
                          className="text-muted-foreground/60 hover:text-rose-400 p-0.5 rounded transition-colors"
                          title="Delete custom clip"
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

        {/* Footer Notes */}
        <div className="px-6 py-2.5 border-t border-white/[0.06] bg-surface-header/50 flex items-center justify-between text-[11px] text-muted-foreground/60">
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-primary" />
            <span>Sounds automatically mix into active voice call audio stream.</span>
          </div>
          <span className="font-mono text-[10px]">Press Esc or Stop to halt playback</span>
        </div>
      </div>

      {/* Upload Custom Sound Submodal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowUploadModal(false)}
          />

          <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-surface-panel p-5 sm:p-6 shadow-2xl shadow-black/90 z-10 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-primary" />
                Upload Custom Sound
              </h4>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                aria-label="Close upload modal"
                className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-white/[0.04] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Dropzone / Input */}
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
                'border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors',
                uploadFile
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-white/[0.1] hover:border-white/[0.2] bg-white/[0.02]'
              )}
            >
              {uploadFile ? (
                <div className="flex items-center justify-center gap-2 text-emerald-400 font-medium text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="truncate max-w-[200px]">{uploadFile.name}</span>
                  <span className="font-mono text-[10px]">({uploadDuration}s)</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <UploadCloud className="w-8 h-8 text-muted-foreground/60 mx-auto" />
                  <div className="text-xs font-medium text-foreground">
                    Click to select audio file
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 font-mono">
                    MP3, WAV, OGG (Max 10s, 5MB)
                  </div>
                </div>
              )}
            </div>

            {uploadError && (
              <div className="text-xs text-rose-400 font-medium">{uploadError}</div>
            )}

            <div className="space-y-3">
              <div>
                <label htmlFor="sound-upload-name" className="text-xs font-medium text-foreground block mb-1">
                  Sound Name
                </label>
                <input
                  id="sound-upload-name"
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="e.g. Squad Wipeout"
                  aria-label="Sound Name"
                  className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-foreground text-xs focus:outline-none focus:border-white/[0.2] transition-colors"
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
                  aria-label="Category"
                  className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-foreground text-xs focus:outline-none focus:border-white/[0.2] transition-colors"
                >
                  <option value="memes" className="bg-surface-panel">Gaming Memes</option>
                  <option value="combat" className="bg-surface-panel">Combat & SFX</option>
                  <option value="callouts" className="bg-surface-panel">Tactical Callouts</option>
                  <option value="custom" className="bg-surface-panel">My Uploads</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUploadModal(false)}
                className="border-white/[0.08] bg-white/[0.02] text-xs font-medium"
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={!uploadFile || !uploadName.trim() || !!uploadError}
                onClick={handleSaveCustomSound}
                className="text-xs font-medium"
              >
                Save Sound Clip
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
