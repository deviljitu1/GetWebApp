import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { TaskWithSessions, ProfileWithRole, AppRole, Client, Project, TaskPriority, ApprovalStatus, TaskStatus } from '@/types';
import { toast } from '@/hooks/use-toast';
import { getElapsedMs } from '@/lib/utils';
import { getNotificationPrefs, playNotificationSound } from '@/lib/notifications';
import { initNotifications, showNativeNotification } from '@/lib/pushNotifications';
import {
  isOnline,
  enqueueOfflineAction,
  cacheTasks,
  getCachedTasks,
  processOfflineQueue,
  generateUUID,
} from '@/lib/offlineSync';

export interface NewTaskInput {
  title: string;
  description: string;
  category: string;
  date: string;
  target_minutes?: number;
  user_id?: string;
  client_id?: string | null;
  project_id?: string | null;
  priority?: TaskPriority;
  due_date?: string | null;
  is_billable?: boolean;
  hourly_rate_override?: number | null;
}

export type TaskUpdateInput = Partial<NewTaskInput> & {
  status?: TaskStatus;
  approval_status?: ApprovalStatus;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
};

interface DataContextType {
  members: ProfileWithRole[];
  tasks: TaskWithSessions[];
  clients: Client[];
  projects: Project[];
  loading: boolean;
  addTask: (task: NewTaskInput) => Promise<void>;
  updateTask: (id: string, updates: TaskUpdateInput) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  startTimer: (taskId: string) => Promise<void>;
  pauseTimer: (taskId: string) => Promise<void>;
  finishTask: (taskId: string, details?: { completion_notes?: string; project_link?: string }) => Promise<void>;
  approveTask: (taskId: string) => Promise<void>;
  rejectTask: (taskId: string, reason: string) => Promise<void>;
  refreshTasks: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  refreshClients: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  addClient: (input: Omit<Client, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => Promise<void>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  addProject: (input: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  toggleMemberActive: (profileId: string, isActive: boolean) => Promise<void>;
  updateMember: (id: string, updates: { name?: string; employee_type?: string; created_at?: string }) => Promise<void>;
  updateMemberPassword: (userId: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  deleteMember: (id: string) => Promise<void>;
}


const DataContext = createContext<DataContextType | null>(null);

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
};

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [members, setMembers] = useState<ProfileWithRole[]>([]);
  const [tasks, setTasks] = useState<TaskWithSessions[]>(() => getCachedTasks());
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshClients = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from('clients').select('*').order('name');
      if (!error && data) {
        setClients(data as Client[]);
        localStorage.setItem('worktracker_cached_clients_v1', JSON.stringify(data));
      }
    } catch {
      try {
        const raw = localStorage.getItem('worktracker_cached_clients_v1');
        if (raw) setClients(JSON.parse(raw));
      } catch {}
    }
  }, [user]);

  const refreshProjects = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        setProjects(data as Project[]);
        localStorage.setItem('worktracker_cached_projects_v1', JSON.stringify(data));
      }
    } catch {
      try {
        const raw = localStorage.getItem('worktracker_cached_projects_v1');
        if (raw) setProjects(JSON.parse(raw));
      } catch {}
    }
  }, [user]);

  const addClient = useCallback(async (input: Omit<Client, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
    if (!user) return;
    const { error } = await supabase.from('clients').insert({ ...input, created_by: user.userId });
    if (error) throw error;
    await refreshClients();
  }, [user, refreshClients]);

  const updateClient = useCallback(async (id: string, updates: Partial<Client>) => {
    const { error } = await supabase.from('clients').update(updates as never).eq('id', id);
    if (error) throw error;
    await refreshClients();
  }, [refreshClients]);

  const deleteClient = useCallback(async (id: string) => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) throw error;
    await Promise.all([refreshClients(), refreshProjects(), refreshTasksRef.current?.()]);
  }, []);

  const addProject = useCallback(async (input: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
    if (!user) return;
    const { error } = await supabase.from('projects').insert({ ...input, created_by: user.userId });
    if (error) throw error;
    await refreshProjects();
  }, [user, refreshProjects]);

  const updateProject = useCallback(async (id: string, updates: Partial<Project>) => {
    const { error } = await supabase.from('projects').update(updates as never).eq('id', id);
    if (error) throw error;
    await refreshProjects();
  }, [refreshProjects]);

  const deleteProject = useCallback(async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
    await refreshProjects();
  }, [refreshProjects]);

  const refreshTasksRef = useRef<(() => Promise<void>) | null>(null);

  const refreshTasks = useCallback(async () => {
    if (!user) return;

    if (!isOnline()) {
      const cached = getCachedTasks();
      if (cached.length > 0) {
        setTasks(cached);
      }
      return;
    }

    try {
      let query = supabase
        .from('tasks')
        .select('*, time_sessions(*)')
        .order('created_at', { ascending: false });

      if (user.role !== 'admin') {
        query = query.eq('user_id', user.userId);
      }

      const { data, error } = await query;
      if (!error && data) {
        const loadedTasks = data as unknown as TaskWithSessions[];
        // Preserve any pending offline tasks that have not yet synced to Supabase
        const serverIds = new Set(loadedTasks.map(t => t.id));
        const cached = getCachedTasks();
        const pendingLocal = cached.filter(t => !serverIds.has(t.id));
        const merged = [...pendingLocal, ...loadedTasks];
        setTasks(merged);
        cacheTasks(merged);
      } else {
        const cached = getCachedTasks();
        if (cached.length > 0) setTasks(cached);
      }
    } catch (err) {
      console.warn('Network error fetching tasks, using offline cache:', err);
      const cached = getCachedTasks();
      if (cached.length > 0) setTasks(cached);
    }
  }, [user]);

  const refreshMembers = useCallback(async () => {
    if (!user) return;

    try {
      const { data: profiles } = await supabase.from('profiles').select('*');

      let roles: { user_id: string; role: AppRole }[] = [];
      if (user.role === 'admin') {
        const { data } = await supabase.from('user_roles').select('*');
        if (data) roles = data as { user_id: string; role: AppRole }[];
      }

      const withRoles: ProfileWithRole[] = (profiles || []).map(p => {
        const userRoles = roles.filter(r => r.user_id === p.user_id);
        const isAdmin = userRoles.some(r => r.role === 'admin');
        return {
          ...p,
          role: (isAdmin ? 'admin' : (userRoles[0]?.role as AppRole) || 'employee'),
        };
      });

      setMembers(withRoles);
      localStorage.setItem('worktracker_cached_members_v1', JSON.stringify(withRoles));
    } catch {
      try {
        const raw = localStorage.getItem('worktracker_cached_members_v1');
        if (raw) setMembers(JSON.parse(raw));
      } catch {}
    }
  }, [user]);

  useEffect(() => {
    const handleSyncComplete = () => {
      refreshTasksRef.current?.();
    };
    window.addEventListener('offline-sync-completed', handleSyncComplete);
    return () => window.removeEventListener('offline-sync-completed', handleSyncComplete);
  }, []);

  useEffect(() => {
    refreshTasksRef.current = refreshTasks;
  }, [refreshTasks]);

  useEffect(() => {
    if (user) {
      initNotifications(user.userId);
      setLoading(true);
      Promise.all([refreshTasks(), refreshMembers(), refreshClients(), refreshProjects()]).finally(() => setLoading(false));

      // Realtime listener for new user notifications
      const channel = supabase
        .channel(`user-notifications-${user.userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.userId}`,
          },
          (payload) => {
            const notif = payload.new as any;
            if (notif) {
              showNativeNotification({
                title: notif.title || 'New GetWebApp Alert',
                body: notif.body || '',
                data: { link_url: notif.link_url },
              });
              toast({
                title: notif.title,
                description: notif.body,
              });
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setTasks([]);
      setMembers([]);
      setClients([]);
      setProjects([]);
      setLoading(false);
    }
  }, [user, refreshTasks, refreshMembers, refreshClients, refreshProjects]);


  // Ref to track notified tasks to avoid spam
  const notifiedTasks = useRef<Record<string, Set<number>>>({});

  // Reminder Logic
  useEffect(() => {
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) return;

    const interval = setInterval(() => {
      const prefs = getNotificationPrefs();
      if (!prefs.remindersEnabled) return;

      tasks.forEach(task => {
        if (task && task.status === 'In Progress' && task.target_minutes && task.time_sessions) {
          const sessions = task.time_sessions || [];
          const elapsedMs = getElapsedMs(sessions);
          const elapsedMinutes = elapsedMs / (1000 * 60);
          const remaining = task.target_minutes - elapsedMinutes;

          if (!notifiedTasks.current[task.id]) {
            notifiedTasks.current[task.id] = new Set();
          }
          const notifiedSet = notifiedTasks.current[task.id];

          if (remaining <= 10 && remaining > 5 && !notifiedSet.has(10)) {
            showNativeNotification({
              title: 'Reminder: 10m Remaining ⏱️',
              body: `Task "${task.title}" is due in 10 minutes.`,
            });
            toast({
              title: 'Reminder: 10 minutes remaining',
              description: `Task "${task.title}" is due in 10 minutes.`,
              duration: 6000,
            });
            notifiedSet.add(10);
          }

          if (remaining <= 5 && remaining > 0 && !notifiedSet.has(5)) {
            showNativeNotification({
              title: 'Critical: 5m Remaining 🚨',
              body: `Task "${task.title}" is due in 5 minutes!`,
            });
            toast({
              title: 'Critical: 5 minutes remaining',
              description: `Task "${task.title}" is due in 5 minutes.`,
              variant: 'destructive',
              duration: 6000,
            });
            notifiedSet.add(5);
          }

          if (remaining <= 0 && !notifiedSet.has(0)) {
            showNativeNotification({
              title: "Time's Up! ⏰",
              body: `Time limit for task "${task.title}" has been reached.`,
            });
            toast({
              title: "Time's up",
              description: `Time limit for task "${task.title}" has been reached.`,
              variant: 'destructive',
              duration: 6000,
            });
            notifiedSet.add(0);
          }
        }
      });
    }, 15000);

    return () => clearInterval(interval);
  }, [tasks]);

  const addTask = useCallback(async (task: NewTaskInput) => {
    if (!user) return;
    const targetUserId = task.user_id || user.userId;
    const taskId = generateUUID();
    const nowIso = new Date().toISOString();

    const optimisticTask: TaskWithSessions = {
      id: taskId,
      user_id: targetUserId,
      title: task.title,
      description: task.description || '',
      category: task.category,
      date: task.date,
      target_minutes: task.target_minutes || null,
      client_id: task.client_id ?? null,
      project_id: task.project_id ?? null,
      priority: task.priority ?? 'Medium',
      due_date: task.due_date ?? null,
      is_billable: task.is_billable ?? false,
      hourly_rate_override: task.hourly_rate_override ?? null,
      status: 'Not Started',
      approval_status: 'Pending',
      approved_by: null,
      approved_at: null,
      rejection_reason: null,
      completion_notes: null,
      project_link: null,
      recurring_template_id: null,
      created_at: nowIso,
      updated_at: nowIso,
      time_sessions: [],
    };

    // Optimistically update local state & cache
    setTasks(prev => {
      const updated = [optimisticTask, ...prev];
      cacheTasks(updated);
      return updated;
    });

    if (!isOnline()) {
      enqueueOfflineAction('ADD_TASK', { taskInput: task, userId: targetUserId, taskId });
      toast({
        title: 'Task Created Offline 📴',
        description: 'Saved locally. Will sync automatically once connected.',
      });
      return;
    }

    try {
      const { error } = await supabase.from('tasks').insert({
        id: taskId,
        user_id: targetUserId,
        title: task.title,
        description: task.description || '',
        category: task.category,
        date: task.date,
        target_minutes: task.target_minutes || null,
        client_id: task.client_id ?? null,
        project_id: task.project_id ?? null,
        priority: task.priority ?? 'Medium',
        due_date: task.due_date ?? null,
        is_billable: task.is_billable ?? false,
        hourly_rate_override: task.hourly_rate_override ?? null,
      });

      if (error) {
        console.warn('Database error, queuing task offline:', error);
        enqueueOfflineAction('ADD_TASK', { taskInput: task, userId: targetUserId, taskId });
        toast({
          title: 'Saved Offline',
          description: 'Network or database issue. Task will sync automatically.',
        });
      } else {
        await refreshTasks();
      }
    } catch (err) {
      console.warn('Network issue adding task, queuing offline:', err);
      enqueueOfflineAction('ADD_TASK', { taskInput: task, userId: targetUserId, taskId });
      toast({
        title: 'Saved Offline 📴',
        description: 'Network disconnected. Task queued for automatic sync.',
      });
    }
  }, [user, refreshTasks]);

  const updateTask = useCallback(async (id: string, updates: TaskUpdateInput) => {
    setTasks(prev => {
      const updated = prev.map(t => (t.id === id ? { ...t, ...updates } : t));
      cacheTasks(updated);
      return updated;
    });

    if (!isOnline()) {
      enqueueOfflineAction('UPDATE_TASK', { id, updates });
      return;
    }

    try {
      await supabase.from('tasks').update(updates as never).eq('id', id);
      await refreshTasks();
    } catch (err) {
      console.warn('Network issue updating task, queuing offline:', err);
      enqueueOfflineAction('UPDATE_TASK', { id, updates });
    }
  }, [refreshTasks]);

  const deleteTask = useCallback(async (id: string) => {
    setTasks(prev => {
      const updated = prev.filter(t => t.id !== id);
      cacheTasks(updated);
      return updated;
    });

    if (!isOnline()) {
      enqueueOfflineAction('DELETE_TASK', { id });
      return;
    }

    try {
      await supabase.from('tasks').delete().eq('id', id);
      await refreshTasks();
    } catch (err) {
      console.warn('Network issue deleting task, queuing offline:', err);
      enqueueOfflineAction('DELETE_TASK', { id });
    }
  }, [refreshTasks]);

  const startTimer = useCallback(async (taskId: string) => {
    if (!user) return;
    const now = Date.now();
    const sessionId = generateUUID();

    // Optimistically update local state & cache
    setTasks(prev => {
      const updated = prev.map(t => {
        if (t.user_id === user.userId && t.id !== taskId) {
          const closedSessions = (t.time_sessions || []).map(s =>
            s.end_time === null ? { ...s, end_time: now } : s
          );
          return {
            ...t,
            status: (t.status === 'In Progress' ? 'Not Started' : t.status) as TaskStatus,
            time_sessions: closedSessions,
          };
        }
        if (t.id === taskId) {
          const newSession = {
            id: sessionId,
            task_id: taskId,
            start_time: now,
            end_time: null,
            created_by: user.userId,
          };
          return {
            ...t,
            status: 'In Progress' as TaskStatus,
            time_sessions: [...(t.time_sessions || []), newSession],
          };
        }
        return t;
      });
      cacheTasks(updated);
      return updated;
    });

    if (!isOnline()) {
      enqueueOfflineAction('START_TIMER', { taskId, startTime: now, sessionId });
      toast({
        title: 'Timer Started Offline ⏱️',
        description: 'Tracking locally. Will sync automatically once connected.',
      });
      return;
    }

    try {
      // Close any open sessions for other tasks of this user
      const openSessions = tasks
        .filter(t => t.user_id === user.userId && t.id !== taskId)
        .flatMap(t => t.time_sessions.filter(s => s.end_time === null));

      for (const session of openSessions) {
        await supabase.from('time_sessions').update({ end_time: now }).eq('id', session.id);
      }

      await supabase.from('time_sessions').insert({
        id: sessionId,
        task_id: taskId,
        start_time: now,
      });

      await supabase.from('tasks').update({ status: 'In Progress' }).eq('id', taskId);
      await refreshTasks();
    } catch (err) {
      console.warn('Network issue starting timer, queuing offline:', err);
      enqueueOfflineAction('START_TIMER', { taskId, startTime: now, sessionId });
    }
  }, [user, tasks, refreshTasks]);

  const pauseTimer = useCallback(async (taskId: string) => {
    const now = Date.now();

    // Optimistically update local state & cache
    setTasks(prev => {
      const updated = prev.map(t => {
        if (t.id === taskId) {
          const closed = (t.time_sessions || []).map(s =>
            s.end_time === null ? { ...s, end_time: now } : s
          );
          return { ...t, time_sessions: closed };
        }
        return t;
      });
      cacheTasks(updated);
      return updated;
    });

    if (!isOnline()) {
      enqueueOfflineAction('PAUSE_TIMER', { taskId, endTime: now });
      toast({
        title: 'Timer Paused Offline ⏸️',
        description: 'Session saved locally. Will sync when reconnected.',
      });
      return;
    }

    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      const openSessions = task.time_sessions.filter(s => s.end_time === null);
      for (const session of openSessions) {
        await supabase.from('time_sessions').update({ end_time: now }).eq('id', session.id);
      }
      await refreshTasks();
    } catch (err) {
      console.warn('Network issue pausing timer, queuing offline:', err);
      enqueueOfflineAction('PAUSE_TIMER', { taskId, endTime: now });
    }
  }, [tasks, refreshTasks]);

  const finishTask = useCallback(async (taskId: string, details?: { completion_notes?: string; project_link?: string }) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !user) return;
    const now = Date.now();
    const isAdmin = user.role === 'admin';

    // Optimistically update local state & cache
    setTasks(prev => {
      const updated = prev.map(t => {
        if (t.id === taskId) {
          const closed = (t.time_sessions || []).map(s =>
            s.end_time === null ? { ...s, end_time: now } : s
          );
          return {
            ...t,
            status: 'Finished' as TaskStatus,
            approval_status: (isAdmin ? 'Approved' : 'Pending') as ApprovalStatus,
            completion_notes: details?.completion_notes || t.completion_notes,
            project_link: details?.project_link || t.project_link,
            time_sessions: closed,
          };
        }
        return t;
      });
      cacheTasks(updated);
      return updated;
    });

    if (!isOnline()) {
      enqueueOfflineAction('FINISH_TASK', { taskId, details, endTime: now });
      toast({
        title: 'Task Finished Offline ✅',
        description: 'Saved locally. Will sync automatically once connected.',
      });
      return;
    }

    try {
      const openSessions = task.time_sessions.filter(s => s.end_time === null);
      for (const session of openSessions) {
        await supabase.from('time_sessions').update({ end_time: now }).eq('id', session.id);
      }

      const updates: Record<string, unknown> = {
        status: 'Finished',
        approval_status: isAdmin ? 'Approved' : 'Pending',
      };
      if (isAdmin) {
        updates.approved_by = user.userId;
        updates.approved_at = new Date().toISOString();
      }
      if (details?.completion_notes) updates.completion_notes = details.completion_notes;
      if (details?.project_link) updates.project_link = details.project_link;

      await supabase.from('tasks').update(updates as never).eq('id', taskId);
      await refreshTasks();
    } catch (err) {
      console.warn('Network issue finishing task, queuing offline:', err);
      enqueueOfflineAction('FINISH_TASK', { taskId, details, endTime: now });
    }
  }, [tasks, user, refreshTasks]);

  const approveTask = useCallback(async (taskId: string) => {
    if (!user || user.role !== 'admin') return;
    await supabase.from('tasks').update({
      approval_status: 'Approved',
      approved_by: user.userId,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    } as never).eq('id', taskId);
    await refreshTasks();
  }, [user, refreshTasks]);

  const rejectTask = useCallback(async (taskId: string, reason: string) => {
    if (!user || user.role !== 'admin') return;
    await supabase.from('tasks').update({
      approval_status: 'Rejected',
      approved_by: user.userId,
      approved_at: new Date().toISOString(),
      rejection_reason: reason,
      status: 'In Progress',
    } as never).eq('id', taskId);
    await refreshTasks();
  }, [user, refreshTasks]);


  const toggleMemberActive = async (profileId: string, isActive: boolean) => {
    if (!user || user.role !== 'admin') return;
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', profileId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update member status.",
        variant: "destructive"
      });
      return;
    }
    await refreshMembers();
  };

  /* New updateMember function */
  const updateMember = async (id: string, updates: { name?: string; employee_type?: string; created_at?: string }) => {
    if (!user || user.role !== 'admin') return;
    const { error } = await supabase
      .from('profiles')
      .update(updates as never)
      .eq('id', id);

    if (error) {
      console.error('Error updating member:', error);
      toast({ title: "Error", description: "Failed to update member.", variant: "destructive" });
    }
    await refreshMembers();
  };

  const updateMemberPassword = async (userId: string, newPassword: string) => {
    if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized' };
    try {
      const { data, error } = await supabase.functions.invoke('update-member-password', {
        body: { target_user_id: userId, new_password: newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { success: true };
    } catch (error: any) {
      console.error('Error updating password:', error);
      return { success: false, error: error.message || 'Failed to update password' };
    }
  };

  const deleteMember = async (id: string) => {
    if (!user || user.role !== 'admin') return;
    const { data, error } = await supabase.functions.invoke('delete-employee', {
      body: { profile_id: id },
    });
    if (error || (data && (data as { error?: string }).error)) {
      const msg = (data as { error?: string } | null)?.error || error?.message || 'Delete failed';
      console.error('Delete failed', msg);
      toast({
        title: 'Cannot Delete Team Member',
        description: msg,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Team member deleted' });
    await Promise.all([refreshMembers(), refreshTasks()]);
  };

  return (
    <DataContext.Provider
      value={{
        members,
        tasks,
        clients,
        projects,
        loading,
        addTask,
        updateTask,
        deleteTask,
        startTimer,
        pauseTimer,
        finishTask,
        approveTask,
        rejectTask,
        refreshTasks,
        refreshMembers,
        refreshClients,
        refreshProjects,
        addClient,
        updateClient,
        deleteClient,
        addProject,
        updateProject,
        deleteProject,
        toggleMemberActive,
        updateMember,
        updateMemberPassword,
        deleteMember,
      }}

    >
      {children}
    </DataContext.Provider>
  );
};
