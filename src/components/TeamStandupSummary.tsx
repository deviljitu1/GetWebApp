import React, { useState, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCall } from '@/components/CallModal';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  Moon,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Download,
  Bell,
  SunMedium,
  Users,
  Smile,
  Meh,
  Frown,
} from 'lucide-react';
import { todayStr } from '@/lib/utils';

export interface StandupRecord {
  id: string;
  user_id: string;
  date: string;
  completed_today: string;
  blockers: string | null;
  tomorrow_plan: string | null;
  mood: string | null;
  created_at: string;
  updated_at: string;
}

export const TeamStandupSummary: React.FC = () => {
  const { members } = useData();
  const { user } = useAuth();
  const { ringMember } = useCall();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [standups, setStandups] = useState<StandupRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const activeEmployees = members.filter((m) => m.is_active && m.role === 'employee');

  const fetchStandups = async (date: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('daily_standups')
        .select('*')
        .eq('date', date);

      if (!error && data) {
        setStandups(data as StandupRecord[]);
      }
    } catch (err) {
      console.warn('Error fetching standups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStandups(selectedDate);
  }, [selectedDate]);

  const submittedUserIds = new Set(standups.map((s) => s.user_id));
  const missingMembers = activeEmployees.filter((m) => !submittedUserIds.has(m.user_id));
  const blockersList = standups.filter((s) => s.blockers && s.blockers.trim().length > 0);

  const submissionRate =
    activeEmployees.length > 0
      ? Math.round((standups.length / activeEmployees.length) * 100)
      : 0;

  const exportSummary = () => {
    const headers = ['Team Member', 'Department', 'Date', 'Mood', 'Completed Today', 'Blockers', 'Tomorrow Plan'];
    const rows = standups.map((s) => {
      const member = members.find((m) => m.user_id === s.user_id);
      return [
        `"${member?.name || 'Unknown'}"`,
        `"${member?.employee_type || 'Other'}"`,
        s.date,
        s.mood || 'good',
        `"${(s.completed_today || '').replace(/"/g, '""')}"`,
        `"${(s.blockers || '').replace(/"/g, '""')}"`,
        `"${(s.tomorrow_plan || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', `team_standup_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const moodIcon = (m: string | null) => {
    switch (m) {
      case 'great':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] gap-1"><Smile className="h-3 w-3" /> Great</Badge>;
      case 'blocked':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-[10px] gap-1"><Frown className="h-3 w-3" /> Blocked</Badge>;
      default:
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px] gap-1"><Meh className="h-3 w-3" /> Productive</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header controls & date picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/80 p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-xl text-amber-500">
            <Moon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-lg tracking-tight">Team Daily Standup Summary</h3>
            <p className="text-xs text-muted-foreground">
              Review completed work, resolve blockers, and track team velocity
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-8 text-xs w-36 font-mono"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={exportSummary}
            disabled={standups.length === 0}
            className="h-8 text-xs gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Overview Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground">Submissions</span>
            <span className="text-xs font-bold text-primary">{submissionRate}%</span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold">{standups.length}</span>
            <span className="text-xs text-muted-foreground">of {activeEmployees.length} employees</span>
          </div>
          <Progress value={submissionRate} className="h-1.5" />
        </Card>

        <Card className="p-4 border">
          <span className="text-xs font-semibold text-muted-foreground">Team Blockers</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className={`text-2xl font-bold ${blockersList.length > 0 ? 'text-destructive' : 'text-emerald-500'}`}>
              {blockersList.length}
            </span>
            <span className="text-xs text-muted-foreground">
              {blockersList.length === 0 ? 'All clear! 🎉' : 'need attention'}
            </span>
          </div>
        </Card>

        <Card className="p-4 border">
          <span className="text-xs font-semibold text-muted-foreground">Pending Check-Ins</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-amber-500">{missingMembers.length}</span>
            <span className="text-xs text-muted-foreground">employees yet to submit</span>
          </div>
        </Card>
      </div>

      {/* Highlighted Blockers Banner if any */}
      {blockersList.length > 0 && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 space-y-3">
          <div className="flex items-center gap-2 text-destructive font-bold text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Active Team Blockers ({blockersList.length})</span>
          </div>
          <div className="grid gap-2">
            {blockersList.map((s) => {
              const member = members.find((m) => m.user_id === s.user_id);
              return (
                <div key={s.id} className="p-2.5 rounded-lg bg-background/80 border text-xs flex items-start gap-3">
                  <span className="font-bold text-foreground shrink-0">{member?.name}:</span>
                  <span className="text-destructive font-medium leading-relaxed">{s.blockers}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Member Standup Cards */}
      <div className="space-y-4">
        <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Submitted Daily Standups ({standups.length})
        </h4>

        {loading ? (
          <div className="h-32 flex items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : standups.length === 0 ? (
          <div className="h-36 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center p-6 text-muted-foreground text-xs space-y-1">
            <Moon className="h-8 w-8 text-muted-foreground/40 mb-1" />
            <p className="font-semibold">No standups submitted for {selectedDate}</p>
            <p className="text-muted-foreground/70">Employees will be prompted at 6:00 PM to submit their evening wrap-up.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {standups.map((s) => {
              const member = members.find((m) => m.user_id === s.user_id);

              return (
                <Card key={s.id} className="p-4 border space-y-3 hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between pb-2 border-b border-border/40">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-9 w-9 border">
                        <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member?.name}`} />
                        <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                          {member?.name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold text-sm leading-tight text-foreground">{member?.name}</p>
                        <p className="text-[11px] text-muted-foreground">{member?.employee_type}</p>
                      </div>
                    </div>
                    {moodIcon(s.mood)}
                  </div>

                  {/* Completed Today */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Completed Today:
                    </span>
                    <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed bg-muted/20 p-2 rounded-md font-mono">
                      {s.completed_today || 'None logged.'}
                    </p>
                  </div>

                  {/* Blockers */}
                  {s.blockers && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Blockers / Obstacles:
                      </span>
                      <p className="text-xs text-destructive/90 bg-destructive/10 p-2 rounded-md leading-relaxed">
                        {s.blockers}
                      </p>
                    </div>
                  )}

                  {/* Tomorrow Plan */}
                  {s.tomorrow_plan && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        <SunMedium className="h-3 w-3" />
                        Tomorrow's Plan:
                      </span>
                      <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed bg-muted/20 p-2 rounded-md">
                        {s.tomorrow_plan}
                      </p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending Check-Ins list with Ring Button */}
      {missingMembers.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-border/40">
          <h4 className="font-bold text-sm text-muted-foreground flex items-center gap-2">
            <Users className="h-4 w-4" />
            Pending Submissions ({missingMembers.length})
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {missingMembers.map((m) => (
              <div
                key={m.user_id}
                className="p-3 rounded-xl border bg-muted/15 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="h-7 w-7 border">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${m.name}`} />
                    <AvatarFallback className="text-[10px]">{m.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="truncate">
                    <p className="font-semibold truncate text-foreground">{m.name}</p>
                    <p className="text-[10px] text-muted-foreground">{m.employee_type}</p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => ringMember(m.user_id, m.name)}
                  className="h-7 text-[11px] gap-1 px-2 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                  title="Nudge / Ring member"
                >
                  <Bell className="h-3 w-3 animate-pulse" />
                  Nudge
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamStandupSummary;
