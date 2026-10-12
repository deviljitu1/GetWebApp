import React, { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { TaskWithSessions } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Plus, Trash2, CheckSquare, ListTodo } from 'lucide-react';
import { generateUUID } from '@/lib/offlineSync';

export interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
}

interface TaskChecklistProps {
  task: TaskWithSessions;
  compact?: boolean;
}

export const TaskChecklist: React.FC<TaskChecklistProps> = ({ task, compact = false }) => {
  const { updateTask } = useData();
  const [newTitle, setNewTitle] = useState('');

  const checklist: ChecklistItem[] = (task as any).checklist || [];
  const total = checklist.length;
  const completedCount = checklist.filter((item) => item.completed).length;
  const progressPercent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const handleToggle = async (itemId: string, completed: boolean) => {
    const updated = checklist.map((item) =>
      item.id === itemId ? { ...item, completed } : item
    );
    await updateTask(task.id, { checklist: updated } as any);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const newItem: ChecklistItem = {
      id: generateUUID(),
      title: newTitle.trim(),
      completed: false,
    };
    const updated = [...checklist, newItem];
    setNewTitle('');
    await updateTask(task.id, { checklist: updated } as any);
  };

  const handleDelete = async (itemId: string) => {
    const updated = checklist.filter((item) => item.id !== itemId);
    await updateTask(task.id, { checklist: updated } as any);
  };

  if (compact) {
    if (total === 0) return null;
    return (
      <div className="w-full space-y-1 mt-2">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
          <span className="flex items-center gap-1">
            <CheckSquare className="h-3 w-3 text-primary" />
            Checklist: {completedCount}/{total} done
          </span>
          <span className="font-semibold">{progressPercent}%</span>
        </div>
        <Progress value={progressPercent} className="h-1.5 bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-3 pt-3 border-t border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
          <ListTodo className="h-4 w-4 text-primary" />
          <span>Subtasks & Checklist</span>
          {total > 0 && (
            <span className="text-muted-foreground font-normal">
              ({completedCount} of {total} done)
            </span>
          )}
        </div>
        {total > 0 && (
          <span className="text-xs font-bold text-primary">{progressPercent}%</span>
        )}
      </div>

      {total > 0 && (
        <Progress value={progressPercent} className="h-1.5 bg-muted" />
      )}

      {/* Checklist items list */}
      {checklist.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {checklist.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 p-1.5 rounded-md hover:bg-muted/40 group text-xs transition-colors"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Checkbox
                  id={`chk-${item.id}`}
                  checked={item.completed}
                  onCheckedChange={(checked) => handleToggle(item.id, !!checked)}
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <label
                  htmlFor={`chk-${item.id}`}
                  className={`cursor-pointer truncate select-none leading-none ${
                    item.completed ? 'line-through text-muted-foreground/70' : 'text-foreground'
                  }`}
                >
                  {item.title}
                </label>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(item.id)}
                className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add new subtask input */}
      <form onSubmit={handleAdd} className="flex items-center gap-1.5">
        <Input
          placeholder="Add subtask / checklist item..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="h-7 text-xs bg-muted/30 focus-visible:ring-1"
        />
        <Button type="submit" size="sm" variant="secondary" className="h-7 px-2.5 text-xs gap-1">
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </form>
    </div>
  );
};

export default TaskChecklist;
