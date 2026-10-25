'use client';

import * as React from 'react';
import { notFound } from 'next/navigation';
import {
  Bell,
  Check,
  ChevronRight,
  Hash,
  MessageSquare,
  Mic,
  Moon,
  MoreHorizontal,
  Phone,
  Search,
  Settings,
  Sun,
  User,
  Users,
  Volume2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Avatar, AvatarGroup } from '@/components/ui/avatar';
import { Badge, Pill, Kbd } from '@/components/ui/badge';
import { SimpleTooltip } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListItem } from '@/components/ui/list-item';
import { useToast } from '@/components/ui/toast';
import { Skeleton, SkeletonList } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, Banner } from '@/components/ui/states';

export default function ComponentGalleryPage() {
  // Guard gallery route in production if desired, but allow in dev / CI
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_ENABLE_GALLERY !== 'true') {
    // allow testing if needed
  }

  const { toast } = useToast();
  const [isDark, setIsDark] = React.useState(true);
  const [activeAccent, setActiveAccent] = React.useState('violet');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [sliderValue, setSliderValue] = React.useState([75]);

  const toggleTheme = (dark: boolean) => {
    setIsDark(dark);
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const changeAccent = (accent: string) => {
    setActiveAccent(accent);
    document.documentElement.setAttribute('data-theme', accent);
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 sm:p-10 max-w-7xl mx-auto space-y-12">
      {/* Top Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nexus Clean Pro — Component Gallery</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Living styleguide and visual regression testbed for all design tokens and primitives.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Accent picker */}
          <div className="flex items-center gap-1.5 p-1 rounded-control bg-secondary border border-border">
            {['violet', 'cyan', 'emerald', 'crimson', 'amber'].map((acc) => (
              <button
                key={acc}
                onClick={() => changeAccent(acc)}
                className={`w-5 h-5 rounded-full capitalize text-xs font-bold transition-all ${
                  activeAccent === acc ? 'ring-2 ring-foreground ring-offset-1 ring-offset-background' : 'opacity-70 hover:opacity-100'
                }`}
                style={{
                  backgroundColor:
                    acc === 'violet' ? 'hsl(240 58% 59%)' :
                    acc === 'cyan' ? 'hsl(199 89% 48%)' :
                    acc === 'emerald' ? 'hsl(152 70% 30%)' :
                    acc === 'crimson' ? 'hsl(350 84% 48%)' : 'hsl(38 92% 50%)',
                }}
                title={`Accent: ${acc}`}
              />
            ))}
          </div>

          {/* Theme Mode Toggle */}
          <div className="flex items-center gap-1 p-0.5 rounded-control bg-secondary border border-border">
            <button
              onClick={() => toggleTheme(false)}
              className={`p-1.5 rounded-[4px] transition-colors ${!isDark ? 'bg-card text-foreground shadow-subtle' : 'text-muted-foreground'}`}
              title="Light Mode"
            >
              <Sun className="w-4 h-4" />
            </button>
            <button
              onClick={() => toggleTheme(true)}
              className={`p-1.5 rounded-[4px] transition-colors ${isDark ? 'bg-card text-foreground shadow-subtle' : 'text-muted-foreground'}`}
              title="Dark Mode"
            >
              <Moon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 1. Buttons */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="text-base font-semibold">Button Variants & Sizes</h2>
          <span className="text-xs text-muted-foreground">Clean Pro 28 / 32 / 40px</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary (Default)</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link Button</Button>
          <Button variant="subtle">Subtle</Button>
          <Button variant="primary" isLoading>Loading</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm">Small (28px)</Button>
          <Button size="md">Medium (32px)</Button>
          <Button size="lg">Large (40px)</Button>
          <Button size="icon" aria-label="Settings">
            <Settings className="w-4 h-4" />
          </Button>
          <Button size="iconSm" variant="ghost" aria-label="More">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* 2. Inputs & Form Controls */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="text-base font-semibold">Inputs, Textarea & Select</h2>
          <span className="text-xs text-muted-foreground">32px compact / 44px touch</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input placeholder="Standard Input..." helperText="This is a helper message" />
          <Input icon={<Search className="w-3.5 h-3.5" />} placeholder="Search with icon..." />
          <Input
            placeholder="Error state..."
            defaultValue="invalid_username$"
            errorText="Username can only contain letters, numbers, and underscores"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Textarea placeholder="Auto-growing textarea..." maxLength={200} showCount defaultValue="Nexus Clean Pro redesign brings a focused, low-noise visual environment." />
          <div className="space-y-3">
            <Select defaultValue="balanced">
              <SelectTrigger>
                <SelectValue placeholder="Select noise mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off (Raw pass-through)</SelectItem>
                <SelectItem value="light">Light (RNNoise Neural 12dB)</SelectItem>
                <SelectItem value="balanced">Balanced (RNNoise Neural 24dB)</SelectItem>
                <SelectItem value="strong">Strong (Aggressive Suppression)</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center justify-between p-3 rounded-card border border-border bg-card">
              <div className="space-y-0.5">
                <span className="text-xs font-medium">Push to Talk</span>
                <p className="text-xs text-muted-foreground">Require holding key to transmit audio</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </div>
      </section>

      {/* 3. Toggles, Checkboxes & Sliders */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="text-base font-semibold">Switch, Checkbox, Radio & Slider</h2>
          <span className="text-xs text-muted-foreground">44px hit areas on touch</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="flex items-center gap-4">
            <Checkbox defaultChecked id="c1" />
            <label htmlFor="c1" className="text-xs font-medium cursor-pointer">Echo Cancellation</label>
            <Checkbox id="c2" />
            <label htmlFor="c2" className="text-xs font-medium cursor-pointer">Auto Gain</label>
          </div>

          <RadioGroup defaultValue="comfortable" className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="comfortable" id="r1" />
              <label htmlFor="r1" className="text-xs font-medium cursor-pointer">Comfortable</label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="compact" id="r2" />
              <label htmlFor="r2" className="text-xs font-medium cursor-pointer">Compact</label>
            </div>
          </RadioGroup>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Output Volume</span>
              <span className="font-mono">{sliderValue[0]}%</span>
            </div>
            <Slider value={sliderValue} onValueChange={setSliderValue} max={100} step={1} />
          </div>
        </div>
      </section>

      {/* 4. Avatars & Presence */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="text-base font-semibold">Avatar Sizes, Presence & Status Indicators</h2>
          <span className="text-xs text-muted-foreground">Never color-only: dot, crescent, bar, ring</span>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <Avatar size={20} name="Alex Vance" showStatus status="online" />
          <Avatar size={24} name="Beatrix Kiddo" showStatus status="idle" />
          <Avatar size={32} name="Commander Shepard" showStatus status="dnd" />
          <Avatar size={40} name="Doom Slayer" showStatus status="offline" />
          <Avatar size={64} name="Gordon Freeman" showStatus status="online" isSpeaking />
          <Avatar size={40} name="Quiet" showStatus status="dnd" isMuted />

          <AvatarGroup max={3}>
            <Avatar size={32} name="Alpha" />
            <Avatar size={32} name="Bravo" />
            <Avatar size={32} name="Charlie" />
            <Avatar size={32} name="Delta" />
            <Avatar size={32} name="Echo" />
          </AvatarGroup>
        </div>
      </section>

      {/* 5. Badges, Pills & Tooltips */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="text-base font-semibold">Badges, Unread Pills & Tooltips</h2>
          <span className="text-xs text-muted-foreground">Max 99+ unread pill, keyboard shortcuts</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="accent">Accent</Badge>
          <Badge variant="success">Online</Badge>
          <Badge variant="warning">Idle</Badge>
          <Badge variant="danger">High Latency</Badge>

          <Pill count={5} variant="accent" />
          <Pill count={142} max={99} variant="accent" />
          <Pill count={3} variant="neutral" />
          <Pill count={1} variant="danger" />

          <SimpleTooltip content="Command Palette" shortcut="Ctrl+K">
            <Button variant="outline" size="sm">Hover for Tooltip</Button>
          </SimpleTooltip>
        </div>
      </section>

      {/* 6. ListItems & Navigation Rows */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="text-base font-semibold">List Item Rows</h2>
          <span className="text-xs text-muted-foreground">32px desktop / 56px mobile</span>
        </div>
        <div className="max-w-md space-y-1 p-2 rounded-card border border-border bg-card">
          <ListItem
            leading={<Avatar size={24} name="Marcus Fenix" showStatus status="online" />}
            title="Marcus Fenix"
            subtitle="Playing Gears • Live in squad"
            trailing={<span className="text-xs text-muted-foreground">12:45 PM</span>}
          />
          <ListItem
            leading={<Avatar size={24} name="Cortana AI" showStatus status="idle" />}
            title="Cortana"
            subtitle="Uploaded 2 attachments"
            unread
            trailing={<Pill count={3} />}
          />
          <ListItem
            leading={<Hash className="w-4 h-4 text-muted-foreground" />}
            title="announcements"
            selected
            trailing={<Badge variant="subtle" size="sm">Read-only</Badge>}
          />
        </div>
      </section>

      {/* 7. Dialogs, Sheets & Modals */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="text-base font-semibold">Dialogs, Sheets & Overlays</h2>
          <span className="text-xs text-muted-foreground">Radix focus trap, Esc, responsive sheet</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setDialogOpen(true)}>Open Responsive Dialog</Button>
          <Button variant="outline" onClick={() => setSheetOpen(true)}>Open Slide-over Sheet</Button>
          <Button
            variant="outline"
            onClick={() => {
              toast({
                title: 'Action Completed',
                description: 'Microphone noise suppression calibrated successfully.',
                type: 'success',
              });
            }}
          >
            Trigger Success Toast
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              toast({
                title: 'Connection Warning',
                description: 'Packet loss reached 4.2% on Frankfurt WebRTC node.',
                type: 'error',
              });
            }}
          >
            Trigger Error Toast
          </Button>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Leave Voice Channel?</DialogTitle>
              <DialogDescription>
                You are currently the host of this squad channel. If you leave, host privileges will transfer to the next member.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => setDialogOpen(false)}>Leave Channel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Channel Members</SheetTitle>
              <SheetDescription>24 users online in this server</SheetDescription>
            </SheetHeader>
            <div className="py-4 space-y-2">
              <ListItem
                leading={<Avatar size={24} name="Admin User" showStatus status="online" />}
                title="System Administrator"
                subtitle="Owner"
              />
              <ListItem
                leading={<Avatar size={24} name="Samus Aran" showStatus status="idle" />}
                title="Samus Aran"
                subtitle="Moderator"
              />
            </div>
          </SheetContent>
        </Sheet>
      </section>

      {/* 8. Skeletons, Empty & Error States */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="text-base font-semibold">States & Skeletons</h2>
          <span className="text-xs text-muted-foreground">Offline, reconnecting, empty, loading</span>
        </div>
        <div className="space-y-3">
          <Banner
            variant="offline"
            title="Connection lost"
            description="You are currently offline. Messages will queue and sync when reconnected."
            action={{ label: 'Retry', onClick: () => {} }}
          />
          <Banner
            variant="reconnecting"
            title="Reconnecting to voice lounge..."
            description="Negotiating ICE candidates with LiveKit gateway."
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-card border border-border bg-card p-4">
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title="No friends online"
              description="None of your friends are currently active. Add a friend or invite someone to your squad."
              action={{ label: 'Add Friend', onClick: () => {} }}
            />
          </div>
          <div className="rounded-card border border-border bg-card p-4">
            <ErrorState
              title="Failed to load direct messages"
              description="A temporary network timeout occurred while querying recent conversations."
              onRetry={() => {}}
            />
          </div>
        </div>
        <div className="rounded-card border border-border bg-card p-4 max-w-md">
          <span className="text-xs font-semibold text-muted-foreground mb-2 block">Loading Shimmer Skeleton</span>
          <SkeletonList count={3} />
        </div>
      </section>
    </div>
  );
}
