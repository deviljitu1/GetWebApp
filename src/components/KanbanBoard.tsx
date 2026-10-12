import React, { useState } from 'react';
import { TaskWithSessions, TaskStatus, ApprovalStatus } from '@/types';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatTimer, formatDuration, getElapsedMs, cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Clock,
  Plus,
  Play,
  Pause,
  CheckCircle2,
  MoreVertical,
  Pencil,
  Trash2,
  Calendar,
  AlertCircle,
  MoveRight,
  ListTodo,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import EditTaskDialog from '@/components/EditTaskDialog';
import FinishTaskDialog from '@/components/FinishTaskDialog';
import AddTaskDialog from '@/components/AddTaskDialog';
import TaskChecklist from '@/components/TaskChecklist';

interface KanbanBoardProps {
  tasks: TaskWithSessions[];
  showAssignee?: boolean;
}

type KanbanColumnId = 'todo' | 'inprogress' | 'review' | 'completed';

interface KanbanColumnConfig {
  id: KanbanColumnId;
  title: string;
  badgeClass: string;
  borderClass: string;
}

const COLUMNS: KanbanColumnConfig[] = [
  {
    id: 'todo',
    title: 'To-Do',
    badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
    borderClass: 'border-slate-500/30',
  },
  {
    id: 'inprogress',
    title: 'In Progress',
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    borderClass: 'border-blue-500/40',
  },
  {
    id: 'review',
    title: 'Review',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    borderClass: 'border-amber-500/40',
  },
  {
    id: 'completed',
    title: 'Completed',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    borderClass: 'border-emerald-500/40',
  },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, showAssignee = true }) => {
  const { updateTask, startTimer, pauseTimer, finishTask, deleteTask, members } = useData();
  const { user } = useAuth();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [activeDropCol, setActiveDropCol] = useState<KanbanColumnId | null>(null);

  // Dialog states for task actions
  const [editingTask, setEditingTask] = useState<TaskWithSessions | null>(null);
  const [finishingTask, setFinishingTask] = useState<TaskWithSessions | null>(null);
  const [expandedChecklist, setExpandedChecklist] = useState<Record<string, boolean>>({});

  const toggleChecklist = (id: string) => {
    setExpandedChecklist((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  /** Determine which column a task belongs to */
  const getTaskColumn = (task: TaskWithSessions): KanbanColumnId => {
    if (task.status === 'In Progress') return 'inprogress';
    if (task.status === 'Finished' && task.approval_status === 'Pending') {
      return 'review';
    }
    if (task.status === 'Finished') return 'completed';
    return 'todo';
  };

  /** Handle moving task to target column */
  const moveTaskToColumn = async (taskId: string, targetCol: KanbanColumnId) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const isAdmin = user?.role === 'admin';

    switch (targetCol) {
      case 'todo':
        await pauseTimer(taskId);
        await updateTask(taskId, {
          status: 'Not Started',
          approval_status: 'Not Required' as ApprovalStatus,
        });
        break;

      case 'inprogress':
        await startTimer(taskId);
        break;

      case 'review':
        await pauseTimer(taskId);
        await updateTask(taskId, {
          status: 'Finished',
          approval_status: 'Pending' as ApprovalStatus,
        });
        break;

      case 'completed':
        await finishTask(taskId, {
          completion_notes: task.completion_notes || undefined,
          project_link: task.project_link || undefined,
        });
        if (isAdmin) {
          await updateTask(taskId, {
            approval_status: 'Approved' as ApprovalStatus,
          });
        }
        break;
    }
  };

  // Drag and Drop event handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, colId: KanbanColumnId) => {
    e.preventDefault();
    if (activeDropCol !== colId) {
      setActiveDropCol(colId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, colId: KanbanColumnId) => {
    e.preventDefault();
    setActiveDropCol(null);
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (taskId) {
      await moveTaskToColumn(taskId, colId);
      setDraggedTaskId(null);
    }
  };

  const getMember = (userId: string) => {
    return members.find((m) => m.user_id === userId);
  };

  const priorityColors: Record<string, string> = {
    Urgent: 'bg-red-500/15 text-red-600 border-red-500/30',
    High: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
    Medium: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
    Low: 'bg-slate-500/15 text-slate-600 border-slate-500/30',
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => getTaskColumn(t) === col.id);
          const totalColTime = colTasks.reduce(
            (sum, t) => sum + getElapsedMs(t.time_sessions),
            0
          );
          const isDropActive = activeDropCol === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
              className={cn(
                'flex flex-col rounded-xl bg-card/60 backdrop-blur-md border p-3.5 min-h-[500px] transition-all duration-200',
                isDropActive
                  ? `${col.borderClass} ring-2 ring-primary/40 bg-primary/5 shadow-md`
                  : 'border-border/60'
              )}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm tracking-tight text-foreground">
                    {col.title}
                  </h3>
                  <Badge variant="outline" className={cn('text-xs px-2 py-0 font-semibold', col.badgeClass)}>
                    {colTasks.length}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                  <Clock className="h-3 w-3" />
                  <span>{formatDuration(totalColTime)}</span>
                </div>
              </div>

              {/* Task Cards in Column */}
              <div className="flex-1 space-y-3">
                {colTasks.length === 0 ? (
                  <div
                    className={cn(
                      'h-32 border-2 border-dashed rounded-lg flex items-center justify-center text-xs text-muted-foreground/60 transition-colors',
                      isDropActive ? 'border-primary bg-primary/5 text-primary' : 'border-border/40'
                    )}
                  >
                    {isDropActive ? 'Drop task here' : 'No tasks in this stage'}
                  </div>
                ) : (
                  colTasks.map((task) => {
                    const isRunning = task.time_sessions.some((s) => s.end_time === null);
                    const elapsed = getElapsedMs(task.time_sessions);
                    const member = getMember(task.user_id);
                    const checklist = (task as any).checklist || [];
                    const chkDone = checklist.filter((c: any) => c.completed).length;
                    const chkTotal = checklist.length;

                    return (
                      <Card
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        className={cn(
                          'p-3.5 border transition-all duration-200 cursor-grab active:cursor-grabbing hover:shadow-md group relative overflow-hidden',
                          isRunning
                            ? 'border-primary/50 bg-primary/5 shadow-sm'
                            : 'border-border/60 hover:border-primary/30 bg-card'
                        )}
                      >
                        {/* Active running pulse border */}
                        {isRunning && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary animate-pulse" />
                        )}

                        {/* Top Meta: Category + Priority + Dropdown */}
                        <div className="flex items-center justify-between gap-1.5 mb-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] px-1.5 py-0 font-semibold uppercase tracking-wider',
                                priorityColors[task.priority || 'Medium']
                              )}
                            >
                              {task.priority || 'Medium'}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                              {task.category}
                            </span>
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100"
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-xs">
                              <DropdownMenuItem onClick={() => setEditingTask(task)}>
                                <Pencil className="h-3.5 w-3.5 mr-2" />
                                Edit Task
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">
                                Move to Stage
                              </DropdownMenuLabel>
                              {COLUMNS.filter((c) => c.id !== col.id).map((c) => (
                                <DropdownMenuItem
                                  key={c.id}
                                  onClick={() => moveTaskToColumn(task.id, c.id)}
                                >
                                  <MoveRight className="h-3.5 w-3.5 mr-2" />
                                  {c.title}
                                </DropdownMenuItem>
                              ))}

                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => deleteTask(task.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Delete Task
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Title & Description */}
                        <h4 className="font-semibold text-sm leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors">
                          {task.title}
                        </h4>
                        {task.description && (
                          <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-2 leading-relaxed">
                            {task.description}
                          </p>
                        )}

                        {/* Checklist progress badge & toggle */}
                        {chkTotal > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleChecklist(task.id)}
                            className="w-full text-left mt-2.5 p-1.5 rounded bg-muted/40 hover:bg-muted/70 transition-colors"
                          >
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                              <span className="flex items-center gap-1">
                                <ListTodo className="h-3 w-3 text-primary" />
                                Subtasks: {chkDone}/{chkTotal}
                              </span>
                              <span className="font-bold text-primary">
                                {Math.round((chkDone / chkTotal) * 100)}%
                              </span>
                            </div>
                            <div className="w-full h-1 bg-muted rounded-full overflow-hidden mt-1">
                              <div
                                className="h-full bg-primary transition-all duration-300"
                                style={{ width: `${(chkDone / chkTotal) * 100}%` }}
                              />
                            </div>
                          </button>
                        )}

                        {/* Expanded Checklist in card */}
                        {expandedChecklist[task.id] && (
                          <TaskChecklist task={task} />
                        )}

                        {/* Bottom Row: Member Avatar + Deadlines + Controls */}
                        <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-border/40">
                          <div className="flex items-center gap-2 min-w-0">
                            {showAssignee && member && (
                              <Avatar className="h-6 w-6 border" title={member.name}>
                                <AvatarImage
                                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`}
                                />
                                <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">
                                  {member.name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                            )}

                            {task.due_date && (
                              <div
                                className={cn(
                                  'flex items-center gap-1 text-[10px] font-mono',
                                  task.due_date < new Date().toISOString().split('T')[0] && task.status !== 'Finished'
                                    ? 'text-destructive font-semibold'
                                    : 'text-muted-foreground'
                                )}
                                title={`Due: ${task.due_date}`}
                              >
                                <Calendar className="h-3 w-3" />
                                <span>{task.due_date.slice(5)}</span>
                              </div>
                            )}
                          </div>

                          {/* Quick Timer Controls */}
                          <div className="flex items-center gap-1.5 font-mono text-xs">
                            <span
                              className={cn(
                                'font-semibold',
                                isRunning ? 'text-primary' : 'text-muted-foreground'
                              )}
                            >
                              {formatTimer(elapsed)}
                            </span>

                            {isRunning ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => pauseTimer(task.id)}
                                className="h-6 w-6 p-0 rounded-full border-primary/30 text-primary hover:bg-primary/10"
                                title="Pause Timer"
                              >
                                <Pause className="h-3 w-3 fill-current" />
                              </Button>
                            ) : task.status !== 'Finished' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startTimer(task.id)}
                                className="h-6 w-6 p-0 rounded-full border-border hover:border-primary/40 hover:text-primary"
                                title="Start Timer"
                              >
                                <Play className="h-3 w-3 fill-current ml-0.5" />
                              </Button>
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dialogs */}
      {editingTask && (
        <EditTaskDialog
          task={editingTask}
          open={!!editingTask}
          onOpenChange={(open) => !open && setEditingTask(null)}
        />
      )}

      {finishingTask && (
        <FinishTaskDialog
          open={!!finishingTask}
          onOpenChange={(open) => !open && setFinishingTask(null)}
          taskTitle={finishingTask.title}
          onConfirm={(details) => finishTask(finishingTask.id, details)}
        />
      )}
    </div>
  );
};

export default KanbanBoard;
