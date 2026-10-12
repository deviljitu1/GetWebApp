import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCall } from '@/components/CallModal';
import { CheckCircle2, Clock, Users, Activity, Loader2, Bell, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Seo from "@/components/Seo";

interface TeamMemberActivity {
    user_id: string;
    name: string;
    role: string;
    is_active: boolean;
    current_task_title: string | null;
    task_description: string | null;
    task_status: string | null;
    todo_tasks: { title: string }[] | null;
    progress_tasks: { title: string }[] | null;
    completed_tasks: { title: string }[] | null;
}

const TeamStatus = () => {
    const { user } = useAuth();
    const { startAudioCall, ringMember } = useCall();
    const [teamActivity, setTeamActivity] = useState<TeamMemberActivity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTeamActivity = async () => {
        try {
            // @ts-ignore
            const { data, error: fetchError } = await supabase.rpc('get_team_activity');
            if (fetchError) {
                console.error('Error fetching team activity:', fetchError);
                setError(fetchError.message);
            } else {
                setTeamActivity((data as unknown as TeamMemberActivity[]) || []);
                setError(null);
            }
        } catch (err: any) {
            console.error('Unexpected error:', err);
            setError(err.message || "Unknown error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTeamActivity();

        const channel = supabase
            .channel('team-status-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchTeamActivity())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchTeamActivity())
            .subscribe();

        const interval = setInterval(fetchTeamActivity, 10000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(interval);
        };
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    // 1. Working Members
    const workingMembers = teamActivity.filter(m => m.current_task_title);

    // 2. Idle / Other Members (Everyone not working)
    const idleMembers = teamActivity.filter(m => !m.current_task_title);

    // 3. Aggregate All Completed Tasks
    const allCompletedTasks = teamActivity.flatMap(member =>
        (member.completed_tasks || []).map(task => ({
            title: task.title,
            user_name: member.name,
            user_role: member.role
        }))
    );

    const renderMemberCard = (member: TeamMemberActivity) => (
        <Card key={member.user_id} className={`glass-card border-l-4 ${member.current_task_title ? 'border-l-green-500' : 'border-l-muted'} hover:scale-[1.02] transition-transform duration-200`}>
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
                <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                        {member.name.charAt(0)}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        {member.name}
                        {user?.userId === member.user_id && (
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-primary/20 text-primary bg-primary/5">You</Badge>
                        )}
                    </CardTitle>
                    <CardDescription className="text-xs uppercase font-medium text-muted-foreground">
                        {member.role || 'Team Member'}
                    </CardDescription>
                </div>
                {member.current_task_title ? (
                    <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20">Active</Badge>
                ) : (
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">Idle</Badge>
                )}
            </CardHeader>
            <CardContent>
                {member.current_task_title ? (
                    <div className="mt-2 p-3 bg-muted/30 rounded-lg border border-muted/50">
                        <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">Active Work</p>
                        <p className="text-sm font-medium text-foreground line-clamp-2" title={member.current_task_title || ''}>
                            {member.current_task_title}
                        </p>
                        {member.task_description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2" title={member.task_description}>
                                {member.task_description}
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="mt-2 p-3 bg-transparent rounded-lg border border-dashed border-muted">
                        <p className="text-sm text-muted-foreground italic text-center">Not currently working</p>
                    </div>
                )}

                {/* Progress Work (Paused) */}
                {member.progress_tasks && member.progress_tasks.length > 0 && (
                    <div className="mt-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Progress Work</p>
                        <ul className="space-y-1">
                            {member.progress_tasks.map((t, idx) => (
                                <li key={idx} className="text-sm flex items-start gap-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                                    <span className="opacity-90">{t.title}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Pending Work */}
                {member.todo_tasks && member.todo_tasks.length > 0 && (
                    <div className="mt-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Todo</p>
                        <ul className="space-y-1">
                            {member.todo_tasks.map((t, idx) => (
                                <li key={idx} className="text-sm flex items-start gap-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-orange-400 mt-1.5 shrink-0" />
                                    <span className="opacity-90">{t.title}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Direct Call & Bell Ring actions */}
                {user?.userId !== member.user_id && (
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/40">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => ringMember(member.user_id, member.name)}
                            className="h-7 text-xs gap-1.5 flex-1 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 font-semibold"
                        >
                            <Bell className="h-3 w-3 animate-pulse" />
                            Ring Bell
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startAudioCall(member.user_id, member.name)}
                            className="h-7 text-xs gap-1.5 flex-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 font-semibold"
                        >
                            <Phone className="h-3 w-3" />
                            Call
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-10">
            <Seo title="Team Status — WorkTracker" description="Real-time view of who is working, what they are working on, and today's team activity." path="/team-status" noindex />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Team <span className="text-primary">Status</span></h1>
                    <p className="text-muted-foreground mt-2 flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        <span>Real-time dashboard of team activity.</span>
                    </p>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">{error}</div>
            )}

            {/* 1. Working Now */}
            {workingMembers.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b">
                        <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                        <h2 className="text-xl font-semibold">Working Now</h2>
                        <Badge variant="secondary" className="ml-auto">{workingMembers.length}</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {workingMembers.map(renderMemberCard)}
                    </div>
                </div>
            )}

            {/* 2. Idle / Other */}
            {idleMembers.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b">
                        <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
                        <h2 className="text-xl font-semibold">Team Members (Idle)</h2>
                        <Badge variant="secondary" className="ml-auto">{idleMembers.length}</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {idleMembers.map(renderMemberCard)}
                    </div>
                </div>
            )}

            {/* 3. Global Completed Work Feed */}
            <div className="mt-12 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-primary/20">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-semibold text-primary">Completed Today</h2>
                    <Badge variant="outline" className="ml-auto border-primary/20 text-primary">{allCompletedTasks.length}</Badge>
                </div>

                {allCompletedTasks.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground border border-dashed rounded-lg bg-muted/10">
                        No work completed yet today.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3">
                        {allCompletedTasks.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-4 p-4 rounded-lg border bg-card/50 hover:bg-card hover:border-primary/20 transition-colors">
                                <Avatar className="h-8 w-8 border border-border">
                                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${item.user_name}`} />
                                    <AvatarFallback>{item.user_name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{item.title}</p>
                                    <p className="text-xs text-muted-foreground">Completed by <span className="font-semibold text-foreground">{item.user_name}</span></p>
                                </div>
                                <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20 shrink-0">Done</Badge>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeamStatus;
