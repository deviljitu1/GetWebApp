import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  SunMedium,
  Moon,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Smile,
  Meh,
  Frown,
} from 'lucide-react';

export const DailyStandupPrompt: React.FC = () => {
  const { user } = useAuth();
  const { tasks } = useData();
  const [open, setOpen] = useState(false);
  const [hasSubmittedToday, setHasSubmittedToday] = useState(false);
  const [completedToday, setCompletedToday] = useState('');
  const [blockers, setBlockers] = useState('');
  const [tomorrowPlan, setTomorrowPlan] = useState('');
  const [mood, setMood] = useState<'great' | 'good' | 'blocked'>('good');
  const [loading, setLoading] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  // Check if standup was already submitted for today
  useEffect(() => {
    if (!user) return;

    const checkStandup = async () => {
      try {
        const { data, error } = await supabase
          .from('daily_standups')
          .select('*')
          .eq('user_id', user.userId)
          .eq('date', todayStr)
          .maybeSingle();

        if (data) {
          setHasSubmittedToday(true);
          setCompletedToday(data.completed_today || '');
          setBlockers(data.blockers || '');
          setTomorrowPlan(data.tomorrow_plan || '');
          setMood((data.mood as any) || 'good');
        } else {
          setHasSubmittedToday(false);
          // Check if it's 6:00 PM (18:00) or later
          const hour = new Date().getHours();
          const dismissedForSession = sessionStorage.getItem(`standup_dismissed_${todayStr}`);
          if (hour >= 18 && !dismissedForSession) {
            // Pre-fill tasks finished today
            const finishedTasks = tasks.filter(
              (t) => t.date === todayStr && t.status === 'Finished' && t.user_id === user.userId
            );
            if (finishedTasks.length > 0) {
              const bullets = finishedTasks.map((t) => `• ${t.title}`).join('\n');
              setCompletedToday(bullets);
            }
            setOpen(true);
          }
        }
      } catch (err) {
        console.warn('Error checking daily standup:', err);
      }
    };

    checkStandup();
  }, [user, tasks, todayStr]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    try {
      const { error } = await supabase.from('daily_standups').upsert(
        {
          user_id: user.userId,
          date: todayStr,
          completed_today: completedToday.trim(),
          blockers: blockers.trim(),
          tomorrow_plan: tomorrowPlan.trim(),
          mood,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,date' }
      );

      if (error) throw error;

      toast({
        title: 'Daily Standup Submitted! 🌟',
        description: 'Your evening wrap-up has been recorded and shared with the team.',
      });

      setHasSubmittedToday(true);
      setOpen(false);
    } catch (err: any) {
      console.error('Error submitting standup:', err);
      toast({
        title: 'Failed to submit standup',
        description: err.message || 'Error occurred.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem(`standup_dismissed_${todayStr}`, 'true');
    setOpen(false);
  };

  return (
    <>
      {/* Floating or embedded button so employees can open anytime */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          if (!completedToday) {
            const finishedTasks = tasks.filter(
              (t) => t.date === todayStr && t.status === 'Finished' && t.user_id === user?.userId
            );
            if (finishedTasks.length > 0) {
              setCompletedToday(finishedTasks.map((t) => `• ${t.title}`).join('\n'));
            }
          }
          setOpen(true);
        }}
        className={`gap-1.5 text-xs font-semibold ${
          hasSubmittedToday
            ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
            : 'border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
        }`}
      >
        {hasSubmittedToday ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span>Evening Standup Done</span>
          </>
        ) : (
          <>
            <Moon className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
            <span>6 PM Evening Wrap-Up</span>
          </>
        )}
      </Button>

      {/* Standup Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-500/10 rounded-xl text-amber-500">
                <Moon className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  Evening Standup & Daily Wrap-Up 🌆
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  "What did you finish today? Any blockers for tomorrow?"
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="completed" className="text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                What did you finish today? *
              </Label>
              <Textarea
                id="completed"
                rows={3}
                placeholder="• Completed API endpoint for notifications&#10;• Fixed CSS layout bugs"
                value={completedToday}
                onChange={(e) => setCompletedToday(e.target.value)}
                required
                className="text-xs leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="blockers" className="text-xs font-bold flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-3.5 w-3.5" />
                Any blockers or challenges? (Leave blank if none)
              </Label>
              <Textarea
                id="blockers"
                rows={2}
                placeholder="e.g. Waiting for client credentials, need design review..."
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
                className="text-xs bg-amber-500/5 border-amber-500/20 focus-visible:ring-amber-500/30"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan" className="text-xs font-bold flex items-center gap-1.5">
                <SunMedium className="h-3.5 w-3.5 text-blue-500" />
                Tomorrow's plan & key goals
              </Label>
              <Textarea
                id="plan"
                rows={2}
                placeholder="• Start mobile push notification tests&#10;• Review PRs"
                value={tomorrowPlan}
                onChange={(e) => setTomorrowPlan(e.target.value)}
                className="text-xs"
              />
            </div>

            {/* Mood selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">How was your day?</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={mood === 'great' ? 'default' : 'outline'}
                  onClick={() => setMood('great')}
                  className="h-8 text-xs gap-1.5 flex-1"
                >
                  <Smile className="h-3.5 w-3.5 text-emerald-400" />
                  Great!
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mood === 'good' ? 'default' : 'outline'}
                  onClick={() => setMood('good')}
                  className="h-8 text-xs gap-1.5 flex-1"
                >
                  <Meh className="h-3.5 w-3.5 text-blue-400" />
                  Productive
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mood === 'blocked' ? 'destructive' : 'outline'}
                  onClick={() => setMood('blocked')}
                  className="h-8 text-xs gap-1.5 flex-1"
                >
                  <Frown className="h-3.5 w-3.5 text-red-400" />
                  Blocked
                </Button>
              </div>
            </div>

            <DialogFooter className="mt-4 gap-2">
              <Button type="button" variant="ghost" onClick={handleDismiss} className="text-xs">
                Later
              </Button>
              <Button type="submit" disabled={loading} className="gap-2 text-xs font-bold">
                <Sparkles className="h-3.5 w-3.5" />
                {loading ? 'Submitting...' : hasSubmittedToday ? 'Update Standup' : 'Submit Standup'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DailyStandupPrompt;
