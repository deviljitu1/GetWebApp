import React, { useState } from 'react';
import { TaskWithSessions } from '@/types';
import { useData } from '@/contexts/DataContext';
import { formatTimer, getElapsedMs, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import EditTaskDialog from '@/components/EditTaskDialog';
import AddTaskDialog from '@/components/AddTaskDialog';

interface CalendarDeadlineViewProps {
  tasks: TaskWithSessions[];
}

export const CalendarDeadlineView: React.FC<CalendarDeadlineViewProps> = ({ tasks }) => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [selectedTask, setSelectedTask] = useState<TaskWithSessions | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Month Grid Calculation
  const firstDayOfMonth = new Date(year, month, 1);
  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

  // Previous month trailing days
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const dateObj = new Date(year, month - 1, d);
    days.push({
      dateStr: dateObj.toISOString().split('T')[0],
      dayNum: d,
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    days.push({
      dateStr: dateObj.toISOString().split('T')[0],
      dayNum: d,
      isCurrentMonth: true,
    });
  }

  // Next month leading days to complete full 35 or 42 grid
  const remaining = (7 - (days.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const dateObj = new Date(year, month + 1, d);
    days.push({
      dateStr: dateObj.toISOString().split('T')[0],
      dayNum: d,
      isCurrentMonth: false,
    });
  }

  // Week View calculation
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return {
      dateStr: d.toISOString().split('T')[0],
      dayNum: d.getDate(),
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      isToday: d.toISOString().split('T')[0] === todayStr,
    };
  });

  // Filter tasks for a particular date (either scheduled date or due date)
  const getTasksForDate = (dateStr: string) => {
    return tasks.filter((t) => t.date === dateStr || t.due_date === dateStr);
  };

  // Overdue count
  const overdueTasks = tasks.filter(
    (t) => t.due_date && t.due_date < todayStr && t.status !== 'Finished'
  );

  return (
    <div className="space-y-4">
      {/* Calendar Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/80 p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <CalendarIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            <p className="text-xs text-muted-foreground">
              Track deadlines, scheduled work, and milestones
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {overdueTasks.length > 0 && (
            <Badge variant="destructive" className="gap-1.5 py-1 px-2 text-xs font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" />
              {overdueTasks.length} Overdue
            </Badge>
          )}

          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            <Button
              variant={viewMode === 'month' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('month')}
              className="h-7 text-xs font-medium px-3"
            >
              Month
            </Button>
            <Button
              variant={viewMode === 'week' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('week')}
              className="h-7 text-xs font-medium px-3"
            >
              Week
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={goToToday} className="h-7 text-xs font-medium">
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={prevMonth} className="h-7 w-7">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={nextMonth} className="h-7 w-7">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Month View Grid */}
      {viewMode === 'month' ? (
        <div className="bg-card/70 backdrop-blur-md rounded-xl border shadow-sm overflow-hidden">
          {/* Day Names Header */}
          <div className="grid grid-cols-7 border-b bg-muted/30 text-center text-xs font-semibold text-muted-foreground py-2.5">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-border/40">
            {days.map((item, index) => {
              const dayTasks = getTasksForDate(item.dateStr);
              const isToday = item.dateStr === todayStr;

              return (
                <div
                  key={index}
                  className={cn(
                    'min-h-[110px] p-2 flex flex-col justify-between transition-colors',
                    !item.isCurrentMonth && 'bg-muted/15 opacity-40',
                    isToday && 'bg-primary/5 ring-1 ring-primary/30'
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={cn(
                        'text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center',
                        isToday
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-foreground/80'
                      )}
                    >
                      {item.dayNum}
                    </span>
                    {dayTasks.length > 0 && (
                      <span className="text-[10px] font-mono font-medium text-muted-foreground">
                        {dayTasks.length} task{dayTasks.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Tasks List in cell */}
                  <div className="space-y-1 flex-1 overflow-y-auto max-h-[85px]">
                    {dayTasks.slice(0, 3).map((task) => {
                      const isDeadline = task.due_date === item.dateStr;
                      const isOverdue =
                        isDeadline && task.due_date < todayStr && task.status !== 'Finished';
                      const isFinished = task.status === 'Finished';

                      return (
                        <div
                          key={task.id}
                          onClick={() => setSelectedTask(task)}
                          className={cn(
                            'text-[11px] p-1 rounded truncate cursor-pointer font-medium transition-all flex items-center gap-1 shadow-2xs hover:brightness-105',
                            isFinished
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                              : isOverdue
                              ? 'bg-red-500/15 text-red-600 border border-red-500/30'
                              : isDeadline
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                              : 'bg-primary/10 text-primary border border-primary/20'
                          )}
                          title={`${task.title} ${isDeadline ? '(Deadline)' : ''}`}
                        >
                          {isFinished ? (
                            <CheckCircle2 className="h-3 w-3 shrink-0" />
                          ) : isDeadline ? (
                            <Clock className="h-3 w-3 shrink-0" />
                          ) : null}
                          <span className="truncate">{task.title}</span>
                        </div>
                      );
                    })}
                    {dayTasks.length > 3 && (
                      <span className="text-[10px] text-muted-foreground font-semibold px-1">
                        +{dayTasks.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Week View Grid */
        <div className="bg-card/70 backdrop-blur-md rounded-xl border shadow-sm p-4">
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {weekDays.map((w) => {
              const dayTasks = getTasksForDate(w.dateStr);

              return (
                <div
                  key={w.dateStr}
                  className={cn(
                    'rounded-xl border p-3 flex flex-col min-h-[350px]',
                    w.isToday ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30' : 'bg-muted/10'
                  )}
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/40">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">{w.dayName}</p>
                      <p className={cn('text-lg font-bold', w.isToday && 'text-primary')}>{w.dayNum}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {dayTasks.length}
                    </Badge>
                  </div>

                  <div className="flex-1 space-y-2 overflow-y-auto">
                    {dayTasks.length === 0 ? (
                      <div className="h-28 flex items-center justify-center text-xs text-muted-foreground/60">
                        No tasks
                      </div>
                    ) : (
                      dayTasks.map((task) => (
                        <div
                          key={task.id}
                          onClick={() => setSelectedTask(task)}
                          className="p-2 rounded-lg bg-card border border-border/60 hover:border-primary/40 cursor-pointer shadow-xs transition-all space-y-1"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <Badge variant="secondary" className="text-[9px] px-1 py-0">
                              {task.category}
                            </Badge>
                            {task.status === 'Finished' && (
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                            )}
                          </div>
                          <p className="text-xs font-semibold line-clamp-2 leading-snug">{task.title}</p>
                          {task.due_date && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                              <Clock className="h-2.5 w-2.5" />
                              <span>Due {task.due_date}</span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit Task Dialog */}
      {selectedTask && (
        <EditTaskDialog
          task={selectedTask}
          open={!!selectedTask}
          onOpenChange={(open) => !open && setSelectedTask(null)}
        />
      )}
    </div>
  );
};

export default CalendarDeadlineView;
