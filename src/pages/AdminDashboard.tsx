import { useState, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';
import { todayStr, getElapsedMs, formatDuration, getGreeting } from '@/lib/utils';
import { MEMBER_TYPES, TaskStatus } from '@/types';
import TaskCard from '@/components/TaskCard';
import AddTaskDialog from '@/components/AddTaskDialog';
import StatCard from '@/components/StatCard';
import {
  Users,
  ClipboardList,
  CheckCircle,
  Clock,
  Download,
  LayoutList,
  Kanban,
  Calendar,
  Moon,
  IndianRupee,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import DashboardCharts from '@/components/DashboardCharts';
import { Button } from '@/components/ui/button';
import KanbanBoard from '@/components/KanbanBoard';
import CalendarDeadlineView from '@/components/CalendarDeadlineView';
import TeamStandupSummary from '@/components/TeamStandupSummary';
import ProductivityProfitabilityDashboard from '@/components/ProductivityProfitabilityDashboard';
import AdminPushBroadcastDialog from '@/components/AdminPushBroadcastDialog';
import Seo from "@/components/Seo";

const AdminDashboard = () => {
  const { members, tasks, loading } = useData();
  const today = todayStr();
  const [time, setTime] = useState(new Date());
  const [activeView, setActiveView] = useState<'list' | 'kanban' | 'calendar' | 'standup' | 'profitability'>('list');

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [dateFilter, setDateFilter] = useState(today);
  const [memberFilter, setMemberFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Update department filter when member changes
  useEffect(() => {
    if (memberFilter !== 'all') {
      const selectedEmp = members.find(e => e.user_id === memberFilter);
      if (selectedEmp) {
        setTypeFilter(selectedEmp.employee_type);
      }
    } else {
      setTypeFilter('all');
    }
  }, [memberFilter, members]);

  const activeMembers = members.filter(e => e.is_active && e.role === 'employee');
  const todayTasks = tasks.filter(t => t.date === today);
  const completedToday = todayTasks.filter(t => t.status === 'Finished').length;
  const totalTimeToday = todayTasks.reduce((sum, t) => sum + getElapsedMs(t.time_sessions), 0);

  let filteredTasks = [...tasks];
  if (dateFilter) filteredTasks = filteredTasks.filter(t => t.date === dateFilter);
  if (memberFilter !== 'all') filteredTasks = filteredTasks.filter(t => t.user_id === memberFilter);
  if (typeFilter !== 'all') {
    const empIds = members.filter(e => e.employee_type === typeFilter).map(e => e.user_id);
    filteredTasks = filteredTasks.filter(t => empIds.includes(t.user_id));
  }
  if (statusFilter !== 'all') filteredTasks = filteredTasks.filter(t => t.status === (statusFilter as TaskStatus));

  const getMemberName = (userId: string) => {
    const emp = members.find(e => e.user_id === userId);
    return emp ? `${emp.name} (${emp.employee_type})` : 'Unknown';
  };

  const downloadCSV = () => {
    const headers = ['Task Title', 'Description', 'Category', 'Date', 'Status', 'Team Member', 'Duration (mins)'];
    const rows = filteredTasks.map(t => {
      const emp = members.find(e => e.user_id === t.user_id);
      const duration = Math.round(getElapsedMs(t.time_sessions) / 60000);
      return [
        `"${t.title.replace(/"/g, '""')}"`,
        `"${(t.description || '').replace(/"/g, '""')}"`,
        t.category,
        t.date,
        t.status,
        `"${(emp?.name || 'Unknown').replace(/"/g, '""')}"`,
        duration
      ].join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `tasks_export_${todayStr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Seo title="Admin Dashboard — GetWebApp" description="Track team tasks, hours, clients, and approvals from the GetWebApp admin dashboard." path="/" noindex />
          <h1 className="sr-only">Admin Dashboard — team overview</h1>
          <h2 className="text-3xl font-bold tracking-tight">
            {getGreeting()}, <span className="text-primary">Admin</span>
          </h2>
          <p className="text-muted-foreground mt-1 flex items-center gap-2 text-xs sm:text-sm">
            <Clock className="h-4 w-4" />
            <span>
              {time.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              <span className="mx-2">|</span>
              {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <AdminPushBroadcastDialog />
          <AddTaskDialog />
          <Button onClick={downloadCSV} variant="outline" size="sm" className="gap-1.5 h-9">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Active Team Members" value={activeMembers.length} />
        <StatCard icon={ClipboardList} label="Tasks Today" value={todayTasks.length} />
        <StatCard icon={CheckCircle} label="Completed Today" value={completedToday} />
        <StatCard icon={Clock} label="Total Hours Today" value={formatDuration(totalTimeToday)} />
      </div>

      {/* View Switcher Bar */}
      <div className="flex items-center justify-between gap-2 bg-card p-1.5 rounded-xl border shadow-xs overflow-x-auto">
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant={activeView === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveView('list')}
            className="h-8 text-xs font-semibold gap-1.5 px-3"
          >
            <LayoutList className="h-4 w-4" />
            <span>List View</span>
          </Button>

          <Button
            variant={activeView === 'kanban' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveView('kanban')}
            className="h-8 text-xs font-semibold gap-1.5 px-3"
          >
            <Kanban className="h-4 w-4" />
            <span>Kanban Board</span>
          </Button>

          <Button
            variant={activeView === 'calendar' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveView('calendar')}
            className="h-8 text-xs font-semibold gap-1.5 px-3"
          >
            <Calendar className="h-4 w-4" />
            <span>Calendar & Deadlines</span>
          </Button>

          <Button
            variant={activeView === 'standup' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveView('standup')}
            className="h-8 text-xs font-semibold gap-1.5 px-3"
          >
            <Moon className="h-4 w-4 text-amber-500" />
            <span>Daily Standups</span>
          </Button>

          <Button
            variant={activeView === 'profitability' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveView('profitability')}
            className="h-8 text-xs font-semibold gap-1.5 px-3"
          >
            <IndianRupee className="h-4 w-4 text-emerald-500" />
            <span>Profitability & Dashboard</span>
          </Button>
        </div>
      </div>

      {/* Render View */}
      {activeView === 'kanban' ? (
        <KanbanBoard tasks={filteredTasks} showAssignee={true} />
      ) : activeView === 'calendar' ? (
        <CalendarDeadlineView tasks={filteredTasks} />
      ) : activeView === 'standup' ? (
        <TeamStandupSummary />
      ) : activeView === 'profitability' ? (
        <ProductivityProfitabilityDashboard />
      ) : (
        <>
          <div className="mb-6">
            <DashboardCharts tasks={filteredTasks} />
          </div>

          <div className="glass-card rounded-xl p-6 border-none space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Filters</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</Label>
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  className="bg-background/50 border-input/50"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Team Member</Label>
                <Select value={memberFilter} onValueChange={setMemberFilter}>
                  <SelectTrigger className="bg-background/50 border-input/50">
                    <SelectValue placeholder="All Members" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Members</SelectItem>
                    {activeMembers.map(emp => (
                      <SelectItem key={emp.user_id} value={emp.user_id}>
                        {emp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Department</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="bg-background/50 border-input/50">
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {MEMBER_TYPES.map(t => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-background/50 border-input/50">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="Not Started">Not Started</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Finished">Finished</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">
                Tasks <span className="text-muted-foreground text-base font-normal ml-2">({filteredTasks.length})</span>
              </h2>
            </div>

            {filteredTasks.length === 0 ? (
              <div className="glass-card rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-3 border-dashed border-2">
                <div className="p-4 bg-muted/50 rounded-full">
                  <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <p className="text-lg font-medium text-muted-foreground">No tasks found</p>
                <p className="text-sm text-muted-foreground/60 w-full max-w-xs">
                  Try adjusting your filters to see more results.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredTasks.map(task => (
                  <TaskCard key={task.id} task={task} showUser={getMemberName(task.user_id)} readOnly />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
