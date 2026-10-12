import { useState, useEffect } from 'react';
import { TaskStatus, TaskWithSessions } from '@/types';
import { useData } from '@/contexts/DataContext';
import { formatTimer, formatDuration, getElapsedMs, cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, CheckCircle2, Clock, CalendarDays, Tag, MoreVertical, Pencil, Trash2, Copy, Coffee, LinkIcon, FileText } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import EditTaskDialog from './EditTaskDialog';
import FinishTaskDialog from './FinishTaskDialog';
import TaskChecklist from './TaskChecklist';

const statusConfig: Record<TaskStatus, { className: string; label: string }> = {
  'Not Started': { className: 'bg-muted text-muted-foreground border-transparent', label: 'Not Started' },
  'In Progress': { className: 'bg-primary/10 text-primary border-primary/20 animate-pulse', label: 'In Progress' },
  Finished: { className: 'bg-green-500/10 text-green-600 border-green-500/20', label: 'Finished' },
};

interface TaskCardProps {
  task: TaskWithSessions;
  showUser?: string;
  readOnly?: boolean;
}

const TaskCard = ({ task, showUser, readOnly }: TaskCardProps) => {
  const { startTimer, pauseTimer, finishTask, deleteTask, addTask } = useData();
  const isRunning = task.time_sessions.some(s => s.end_time === null);
  const isFinished = task.status === 'Finished';
  const [elapsed, setElapsed] = useState(() => getElapsedMs(task.time_sessions));
  const [actionLoading, setActionLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showFinish, setShowFinish] = useState(false);

  useEffect(() => {
    setElapsed(getElapsedMs(task.time_sessions));
    if (isRunning) {
      const iv = setInterval(() => {
        setElapsed(prev => prev + 1000);
      }, 1000);
      return () => clearInterval(iv);
    }
  }, [task.time_sessions, isRunning]);

  const config = statusConfig[task.status] || statusConfig['Not Started'];

  const handleDuplicate = async () => {
    setActionLoading(true);
    try {
      await addTask({
        title: `${task.title} (Copy)`,
        description: task.description || '',
        category: task.category,
        date: task.date,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAction = async (fn: (id: string) => Promise<void>) => {
    setActionLoading(true);
    try {
      await fn(task.id);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      await deleteTask(task.id);
      setShowDelete(false);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <Card className={cn(
        "p-5 transition-all duration-300 border border-border/50 hover:border-primary/20 hover:shadow-lg group relative overflow-hidden",
        isRunning ? "border-primary/40 bg-primary/5 shadow-md shadow-primary/5" : "bg-card"
      )}>
        {/* Active Indicator Strip */}
        {isRunning && (
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary animate-pulse" />
        )}

        {/* Actions Menu */}
        {!readOnly && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowEdit(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Task
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDuplicate}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowDelete(true)} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Task
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pl-2 pr-8">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={cn('font-medium px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider',
                task.status === 'In Progress' && !isRunning
                  ? "bg-orange-500/10 text-orange-600 border-orange-500/20"
                  : config.className
              )}>
                {task.status === 'In Progress' && !isRunning ? "On Break" : config.label}
              </Badge>
              <Badge variant="secondary" className="font-normal text-[10px] bg-secondary/50 text-secondary-foreground">
                <Tag className="h-3 w-3 mr-1 opacity-70" />
                {task.category}
              </Badge>
              {task.date && (
                <span className="flex items-center text-[10px] text-muted-foreground">
                  <CalendarDays className="h-3 w-3 mr-1 opacity-70" />
                  {task.date}
                </span>
              )}
            </div>

            <div>
              <h3 className={cn("font-medium text-lg leading-tight group-hover:text-primary transition-colors", isFinished && "text-muted-foreground line-through decoration-border")}>
                {task.title}
              </h3>
              {task.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed opacity-90">{task.description}</p>
              )}
              {showUser && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                    {showUser.charAt(0)}
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">{showUser}</p>
                </div>
              )}

              {isFinished && (task.completion_notes || task.project_link) && (
                <div className="mt-3 space-y-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                  {task.completion_notes && (
                    <div className="flex items-start gap-2 text-xs">
                      <FileText className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                      <p className="text-foreground/80 whitespace-pre-wrap leading-relaxed">{task.completion_notes}</p>
                    </div>
                  )}
                  {task.project_link && (
                    <div className="flex items-center gap-2 text-xs">
                      <LinkIcon className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      <a
                        href={task.project_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline truncate font-medium"
                      >
                        {task.project_link}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Subtasks and checklist progress */}
              <TaskChecklist task={task} />
            </div>
          </div>

          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-4 min-w-[120px]">
            <div className={cn(
              "flex items-center gap-2 font-mono text-sm px-3 py-1.5 rounded-lg border transition-colors",
              isRunning ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-muted/30 border-border text-muted-foreground"
            )}>
              <Clock className={cn("h-4 w-4", isRunning && "animate-spin-slow")} />
              <div className="flex flex-col items-end leading-none">
                <span className="font-bold tracking-wide">
                  {formatTimer(elapsed)}
                </span>
                {task.target_minutes && (
                  <span className={cn(
                    "text-[10px] font-medium mt-0.5",
                    (task.target_minutes * 60 * 1000 - elapsed) < 0 ? "text-destructive" : "text-muted-foreground"
                  )}>
                    / {task.target_minutes}m
                  </span>
                )}
              </div>
            </div>

            {task.target_minutes && (
              <div className="w-full h-1 bg-muted rounded-full overflow-hidden mt-1 max-w-[120px]">
                <div
                  className={cn("h-full transition-all duration-1000 ease-linear",
                    (task.target_minutes * 60 * 1000 - elapsed) < 0 ? "bg-destructive w-full" : "bg-primary"
                  )}
                  style={{ width: `${Math.min(100, (elapsed / (task.target_minutes * 60 * 1000)) * 100)}%` }}
                />
              </div>
            )}

            {!isFinished && !readOnly && (
              <div className="flex items-center gap-2">
                {isRunning ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(pauseTimer)}
                      disabled={actionLoading}
                      className="h-9 w-9 p-0 rounded-full border-primary/20 hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-all"
                      title="Pause"
                    >
                      <Pause className="h-4 w-4 fill-current" />
                      <span className="sr-only">Pause</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(pauseTimer)}
                      disabled={actionLoading}
                      className="h-9 w-9 p-0 rounded-full border-primary/20 hover:bg-orange-500/10 hover:text-orange-600 hover:border-orange-500/50 transition-all"
                      title="Take a Break"
                    >
                      <Coffee className="h-4 w-4" />
                      <span className="sr-only">Take a Break</span>
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(startTimer)}
                    disabled={actionLoading}
                    className="h-9 w-9 p-0 rounded-full border-primary/20 hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-all"
                  >
                    <Play className="h-4 w-4 fill-current ml-0.5" />
                    <span className="sr-only">Start</span>
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowFinish(true)}
                  disabled={actionLoading}
                  className="h-9 w-9 p-0 rounded-full text-muted-foreground hover:text-green-600 hover:bg-green-500/10 transition-all"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="sr-only">Finish</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <EditTaskDialog task={task} open={showEdit} onOpenChange={setShowEdit} />

      <FinishTaskDialog
        open={showFinish}
        onOpenChange={setShowFinish}
        taskTitle={task.title}
        onConfirm={(details) => finishTask(task.id, details)}
      />

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the task
              "{task.title}" and remove all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TaskCard;
