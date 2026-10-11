import Link from 'next/link';
import { Gamepad2, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
      <div className="max-w-md w-full text-center space-y-6 p-8 rounded-2xl bg-card border border-border shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary mx-auto shadow-glow-sm">
          <Gamepad2 className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight">404</h1>
          <h2 className="text-lg font-bold text-foreground mt-1">Area Not Found</h2>
          <p className="text-xs text-muted-foreground mt-2">
            The gaming server, room, or channel you are trying to reach does not exist or has moved.
          </p>
        </div>

        <div className="pt-2">
          <Link href="/">
            <Button className="w-full gap-2">
              <Home className="w-4 h-4" /> Return to Nexus Hub
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
