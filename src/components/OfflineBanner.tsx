import React, { useEffect, useState } from 'react';
import { WifiOff, CloudUpload, RefreshCw, CheckCircle2 } from 'lucide-react';
import {
  isOnline,
  subscribeNetworkStatus,
  subscribeQueueChanges,
  processOfflineQueue,
} from '@/lib/offlineSync';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

export const OfflineBanner: React.FC = () => {
  const [online, setOnline] = useState<boolean>(() => isOnline());
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [justSynced, setJustSynced] = useState<boolean>(false);

  useEffect(() => {
    const unsubNet = subscribeNetworkStatus(setOnline);
    const unsubQueue = subscribeQueueChanges(setPendingCount);
    return () => {
      unsubNet();
      unsubQueue();
    };
  }, []);

  const handleManualSync = async () => {
    if (!online || syncing) return;
    setSyncing(true);
    try {
      const res = await processOfflineQueue();
      if (res.synced > 0) {
        setJustSynced(true);
        toast({
          title: 'Sync Complete ✅',
          description: `Successfully synced ${res.synced} offline update${res.synced > 1 ? 's' : ''} to database.`,
        });
        setTimeout(() => setJustSynced(false), 4000);
      }
    } finally {
      setSyncing(false);
    }
  };

  // If online, no pending changes, and didn't just sync, don't show anything
  if (online && pendingCount === 0 && !justSynced) {
    return null;
  }

  return (
    <aside aria-label="Offline status" className="sticky top-0 z-50 w-full transition-all duration-300 animate-in fade-in slide-in-from-top-2">
      {!online ? (
        <div className="bg-amber-500/95 dark:bg-amber-600/95 text-amber-950 dark:text-white px-4 py-2 shadow-md backdrop-blur-sm flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 font-medium">
            <WifiOff className="h-4 w-4 animate-pulse shrink-0" />
            <span>
              <strong>Offline Mode</strong> — You can still add tasks and track time. Changes save locally.
            </span>
          </div>
          {pendingCount > 0 && (
            <span className="bg-amber-700/30 text-xs px-2.5 py-1 rounded-full font-semibold border border-amber-900/20 shrink-0">
              {pendingCount} pending {pendingCount === 1 ? 'change' : 'changes'}
            </span>
          )}
        </div>
      ) : justSynced ? (
        <div className="bg-emerald-600 text-white px-4 py-1.5 shadow-md flex items-center justify-center gap-2 text-sm font-medium animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>All offline changes synced to your database!</span>
        </div>
      ) : pendingCount > 0 ? (
        <div className="bg-primary text-primary-foreground px-4 py-2 shadow-md flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 font-medium">
            <CloudUpload className="h-4 w-4 shrink-0" />
            <span>Back online! {pendingCount} offline update{pendingCount > 1 ? 's' : ''} ready to sync.</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleManualSync}
            disabled={syncing}
            className="h-7 text-xs font-semibold gap-1.5 px-3 bg-white text-primary hover:bg-white/90"
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>
      ) : null}
    </aside>
  );
};

export default OfflineBanner;
