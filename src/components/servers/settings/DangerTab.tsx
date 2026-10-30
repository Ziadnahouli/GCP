'use client';

import * as React from 'react';
import { AlertTriangle, Crown, Trash2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Server } from '@/lib/types/server';
import { DeleteServerDialog } from './DeleteServerDialog';
import { TransferOwnershipDialog } from './TransferOwnershipDialog';
import { LeaveServerDialog } from './LeaveServerDialog';
import { ToastItem } from '@/components/ui/toast';

interface DangerTabProps {
  server: Server;
  isOwner: boolean;
  currentUserId?: string;
  toast: (options: Omit<ToastItem, 'id'>) => void;
  onDeleteServer?: (serverId: string) => Promise<unknown>;
  onTransferOwnership?: (serverId: string, newOwnerId: string) => Promise<unknown>;
  onLeaveServer?: (serverId: string) => Promise<unknown>;
  onCloseModal: () => void;
}

export function DangerTab({
  server,
  isOwner,
  currentUserId,
  toast,
  onDeleteServer,
  onTransferOwnership,
  onLeaveServer,
  onCloseModal,
}: DangerTabProps) {
  const [showDelete, setShowDelete] = React.useState(false);
  const [showTransfer, setShowTransfer] = React.useState(false);
  const [showLeave, setShowLeave] = React.useState(false);

  const handleDeleteConfirm = async () => {
    try {
      if (onDeleteServer) {
        await onDeleteServer(server.id);
      }
      toast({
        title: 'Server Deleted',
        description: `"${server.name}" has been permanently deleted.`,
        type: 'success',
      });
      onCloseModal();
    } catch (err: unknown) {
      toast({
        title: 'Delete Failed',
        description: (err as Error)?.message || 'Failed to delete server.',
        type: 'error',
      });
    }
  };

  const handleTransferConfirm = async (newOwnerId: string) => {
    try {
      if (onTransferOwnership) {
        await onTransferOwnership(server.id, newOwnerId);
      }
      toast({
        title: 'Ownership Transferred',
        description: 'Server ownership has been successfully transferred.',
        type: 'success',
      });
      onCloseModal();
    } catch (err: unknown) {
      toast({
        title: 'Transfer Failed',
        description: (err as Error)?.message || 'Failed to transfer ownership.',
        type: 'error',
      });
    }
  };

  const handleLeaveConfirm = async () => {
    try {
      if (onLeaveServer) {
        await onLeaveServer(server.id);
      }
      toast({
        title: 'Left Server',
        description: `You have left "${server.name}".`,
        type: 'success',
      });
      onCloseModal();
    } catch (err: unknown) {
      toast({
        title: 'Leave Failed',
        description: (err as Error)?.message || 'Failed to leave server.',
        type: 'error',
      });
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-base font-semibold text-destructive">Danger Zone</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Irreversible actions for membership and server lifecycle management.
        </p>
      </div>

      <div className="space-y-4">
        {/* Leave Server (available for everyone unless they are sole owner) */}
        {!isOwner && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border border-border bg-card/40 gap-4">
            <div className="space-y-0.5">
              <h4 className="text-xs font-semibold text-foreground">Leave Server</h4>
              <p className="text-xs text-muted-foreground">
                You will leave this server and lose access to all its channels and messages.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowLeave(true)}
              className="text-xs text-destructive hover:bg-destructive/10 border-destructive/30 shrink-0 gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              Leave Server
            </Button>
          </div>
        )}

        {/* Transfer Ownership (Owner only) */}
        {isOwner && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border border-warning/30 bg-warning/5 gap-4">
            <div className="space-y-0.5">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-warning" />
                Transfer Ownership
              </h4>
              <p className="text-xs text-muted-foreground">
                Relinquish your ownership to another active member. You will become an Admin.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowTransfer(true)}
              className="text-xs text-warning hover:bg-warning/10 border-warning/30 shrink-0 gap-1.5"
            >
              <Crown className="w-3.5 h-3.5" />
              Transfer Server
            </Button>
          </div>
        )}

        {/* Delete Server (Owner only) */}
        {isOwner && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border border-destructive/30 bg-destructive/5 gap-4">
            <div className="space-y-0.5">
              <h4 className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Delete Server
              </h4>
              <p className="text-xs text-muted-foreground">
                Permanently delete this server, including all channels, messages, invites, and roles.
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setShowDelete(true)}
              className="text-xs shrink-0 gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Server
            </Button>
          </div>
        )}
      </div>

      {/* Action Dialogs */}
      <DeleteServerDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        server={server}
        onConfirm={handleDeleteConfirm}
      />

      <TransferOwnershipDialog
        open={showTransfer}
        onOpenChange={setShowTransfer}
        server={server}
        currentUserId={currentUserId}
        onConfirm={handleTransferConfirm}
      />

      <LeaveServerDialog
        open={showLeave}
        onOpenChange={setShowLeave}
        server={server}
        onConfirm={handleLeaveConfirm}
      />
    </div>
  );
}
