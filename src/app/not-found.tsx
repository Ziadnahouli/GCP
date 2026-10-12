import Link from 'next/link';
import { Gamepad2, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
      <div className="max-w-sm w-full text-center space-y-5 p-6 sm:p-8 rounded-2xl bg-surface-panel border border-white/[0.08] shadow-2xl shadow-black/90">
        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary mx-auto">
          <Gamepad2 className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">404</h1>
          <h2 className="text-sm font-semibold text-foreground mt-1">Area Not Found</h2>
          <p className="text-xs text-muted-foreground/70 mt-1.5 leading-relaxed">
            The gaming server, room, or channel you are trying to reach does not exist or has moved.
          </p>
        </div>

        <div className="pt-1">
          <Link href="/">
            <Button className="w-full gap-2 font-medium text-xs h-10">
              <Home className="w-4 h-4" /> Return to GCP Hub
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
