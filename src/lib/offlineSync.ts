import { Network } from '@capacitor/network';
import { supabase } from '@/integrations/supabase/client';
import { TaskWithSessions } from '@/types';

export type OfflineActionType =
  | 'ADD_TASK'
  | 'UPDATE_TASK'
  | 'DELETE_TASK'
  | 'START_TIMER'
  | 'PAUSE_TIMER'
  | 'FINISH_TASK';

export interface OfflineAction {
  id: string; // unique action ID
  type: OfflineActionType;
  payload: any;
  createdAt: number;
}

const QUEUE_KEY = 'worktracker_offline_queue_v1';
const TASKS_CACHE_KEY = 'worktracker_cached_tasks_v1';

let isOnlineState = typeof navigator !== 'undefined' ? navigator.onLine : true;
let isSyncing = false;

// Initialize network listener
if (typeof window !== 'undefined') {
  Network.getStatus().then((status) => {
    isOnlineState = status.connected;
    notifyStatusChange();
  });

  Network.addListener('networkStatusChange', (status) => {
    const wasOffline = !isOnlineState;
    isOnlineState = status.connected;
    notifyStatusChange();

    if (wasOffline && isOnlineState) {
      console.log('[OfflineSync] Connection restored, processing queue...');
      processOfflineQueue();
    }
  });

  window.addEventListener('online', () => {
    isOnlineState = true;
    notifyStatusChange();
    processOfflineQueue();
  });

  window.addEventListener('offline', () => {
    isOnlineState = false;
    notifyStatusChange();
  });
}

function notifyStatusChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('offline-status-changed', {
        detail: { isOnline: isOnlineState },
      })
    );
  }
}

function notifyQueueChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('offline-queue-changed', {
        detail: { count: getOfflineQueue().length },
      })
    );
  }
}

/** Check whether device is currently online */
export function isOnline(): boolean {
  return isOnlineState;
}

/** Subscribe to online/offline network changes */
export function subscribeNetworkStatus(callback: (online: boolean) => void) {
  const handler = (e: Event) => {
    callback((e as CustomEvent).detail.isOnline);
  };
  window.addEventListener('offline-status-changed', handler);
  callback(isOnlineState);
  return () => window.removeEventListener('offline-status-changed', handler);
}

/** Subscribe to queue size changes */
export function subscribeQueueChanges(callback: (count: number) => void) {
  const handler = (e: Event) => {
    callback((e as CustomEvent).detail.count);
  };
  window.addEventListener('offline-queue-changed', handler);
  callback(getOfflineQueue().length);
  return () => window.removeEventListener('offline-queue-changed', handler);
}

/** Get list of pending offline actions */
export function getOfflineQueue(): OfflineAction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Enqueue an action to be executed when back online */
export function enqueueOfflineAction(type: OfflineActionType, payload: any): OfflineAction {
  const queue = getOfflineQueue();
  const action: OfflineAction = {
    id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    createdAt: Date.now(),
  };

  queue.push(action);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  notifyQueueChange();
  console.log(`[OfflineSync] Enqueued offline action: ${type}`, action);
  return action;
}

/** Save tasks to offline cache */
export function cacheTasks(tasks: TaskWithSessions[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(tasks));
  } catch (err) {
    console.warn('[OfflineSync] Failed to cache tasks:', err);
  }
}

/** Retrieve cached tasks from storage */
export function getCachedTasks(): TaskWithSessions[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TASKS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Standard UUID generator for offline entities compatible with Postgres UUID */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Process and replay queued actions against Supabase */
export async function processOfflineQueue(
  onProgress?: (remaining: number) => void
): Promise<{ synced: number; remaining: number }> {
  if (!isOnlineState || isSyncing) {
    return { synced: 0, remaining: getOfflineQueue().length };
  }

  isSyncing = true;
  let queue = getOfflineQueue();
  let synced = 0;

  console.log(`[OfflineSync] Starting sync of ${queue.length} items...`);

  try {
    while (queue.length > 0) {
      if (!isOnlineState) break; // Lost connection mid-sync

      const action = queue[0];
      let success = false;

      try {
        switch (action.type) {
          case 'ADD_TASK': {
            const { taskInput, userId, taskId } = action.payload;
            const insertPayload: Record<string, unknown> = {
              user_id: userId,
              title: taskInput.title,
              description: taskInput.description || '',
              category: taskInput.category,
              date: taskInput.date,
              target_minutes: taskInput.target_minutes || null,
              client_id: taskInput.client_id ?? null,
              project_id: taskInput.project_id ?? null,
              priority: taskInput.priority ?? 'Medium',
              due_date: taskInput.due_date ?? null,
              is_billable: taskInput.is_billable ?? false,
              hourly_rate_override: taskInput.hourly_rate_override ?? null,
            };
            if (taskId) {
              insertPayload.id = taskId;
            }
            const { error } = await supabase.from('tasks').insert(insertPayload as never);
            if (!error || error.code === '23505') success = true;
            else console.error('[OfflineSync] ADD_TASK error:', error);
            break;
          }

          case 'UPDATE_TASK': {
            const { id, updates } = action.payload;
            const { error } = await supabase.from('tasks').update(updates as never).eq('id', id);
            if (!error) success = true;
            else console.error('[OfflineSync] UPDATE_TASK error:', error);
            break;
          }

          case 'DELETE_TASK': {
            const { id } = action.payload;
            const { error } = await supabase.from('tasks').delete().eq('id', id);
            if (!error) success = true;
            else console.error('[OfflineSync] DELETE_TASK error:', error);
            break;
          }

          case 'START_TIMER': {
            const { taskId, startTime, sessionId } = action.payload;
            const insertPayload: Record<string, unknown> = {
              task_id: taskId,
              start_time: startTime,
            };
            if (sessionId) {
              insertPayload.id = sessionId;
            }
            const { error } = await supabase.from('time_sessions').insert(insertPayload as never);
            if (!error || error.code === '23505') {
              await supabase.from('tasks').update({ status: 'In Progress' } as never).eq('id', taskId);
              success = true;
            } else {
              console.error('[OfflineSync] START_TIMER error:', error);
            }
            break;
          }

          case 'PAUSE_TIMER': {
            const { taskId, sessionId, endTime } = action.payload;
            if (sessionId) {
              const { error } = await supabase
                .from('time_sessions')
                .update({ end_time: endTime } as never)
                .eq('id', sessionId);
              if (!error) success = true;
            } else {
              const { data: openSessions } = await supabase
                .from('time_sessions')
                .select('id')
                .eq('task_id', taskId)
                .is('end_time', null);

              if (openSessions && openSessions.length > 0) {
                const { error } = await supabase
                  .from('time_sessions')
                  .update({ end_time: endTime } as never)
                  .eq('id', openSessions[0].id);
                if (!error) success = true;
              } else {
                success = true;
              }
            }
            break;
          }

          case 'FINISH_TASK': {
            const { taskId, details, endTime } = action.payload;
            // Close open timer session if any
            const { data: openSessions } = await supabase
              .from('time_sessions')
              .select('id')
              .eq('task_id', taskId)
              .is('end_time', null);

            if (openSessions && openSessions.length > 0) {
              await supabase
                .from('time_sessions')
                .update({ end_time: endTime || Date.now() } as never)
                .eq('id', openSessions[0].id);
            }

            const { error } = await supabase
              .from('tasks')
              .update({
                status: 'Finished',
                completion_notes: details?.completion_notes || null,
                project_link: details?.project_link || null,
              } as never)
              .eq('id', taskId);

            if (!error) success = true;
            break;
          }
        }
      } catch (err) {
        console.error(`[OfflineSync] Action ${action.type} failed:`, err);
        success = false;
      }

      if (success) {
        queue.shift(); // Remove processed action
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        synced++;
        notifyQueueChange();
        if (onProgress) onProgress(queue.length);
      } else {
        // Stop syncing on fatal failure or network drop to retry later
        break;
      }
    }
  } finally {
    isSyncing = false;
  }

  if (synced > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offline-sync-completed', { detail: { synced } }));
  }

  console.log(`[OfflineSync] Sync complete. Synced: ${synced}, Remaining: ${queue.length}`);
  return { synced, remaining: queue.length };
}
