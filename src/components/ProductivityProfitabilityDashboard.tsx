import React, { useState, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { TaskWithSessions } from '@/types';
import { getElapsedMs, formatDuration, todayStr } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DollarSign,
  TrendingUp,
  Clock,
  Briefcase,
  PieChart as PieIcon,
  BarChart3,
  Download,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
} from 'recharts';

export const ProductivityProfitabilityDashboard: React.FC = () => {
  const { tasks, clients, projects, members } = useData();
  const [timeRange, setTimeRange] = useState<'month' | 'week' | 'all'>('month');

  const filteredTasks = useMemo(() => {
    const now = new Date();
    if (timeRange === 'week') {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const str = weekStart.toISOString().split('T')[0];
      return tasks.filter((t) => t.date >= str);
    }
    if (timeRange === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const str = monthStart.toISOString().split('T')[0];
      return tasks.filter((t) => t.date >= str);
    }
    return tasks;
  }, [tasks, timeRange]);

  // Financial Calculations
  const defaultRate = 50; // $50/hour default rate if not specified

  const financialSummary = useMemo(() => {
    let billableMs = 0;
    let nonBillableMs = 0;
    let totalRevenue = 0;

    filteredTasks.forEach((t) => {
      const ms = getElapsedMs(t.time_sessions);
      const hours = ms / (1000 * 60 * 60);
      const rate = t.hourly_rate_override ?? defaultRate;

      if (t.is_billable) {
        billableMs += ms;
        totalRevenue += hours * rate;
      } else {
        nonBillableMs += ms;
      }
    });

    const totalMs = billableMs + nonBillableMs;
    const billablePercent = totalMs > 0 ? Math.round((billableMs / totalMs) * 100) : 0;

    return {
      billableHours: Math.round((billableMs / (1000 * 60 * 60)) * 10) / 10,
      nonBillableHours: Math.round((nonBillableMs / (1000 * 60 * 60)) * 10) / 10,
      totalHours: Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10,
      totalRevenue: Math.round(totalRevenue),
      billablePercent,
    };
  }, [filteredTasks]);

  // Client Breakdown
  const clientBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; hours: number; revenue: number; taskCount: number }>();

    filteredTasks.forEach((t) => {
      const client = clients.find((c) => c.id === t.client_id);
      const clientName = client?.name || 'Internal / Unassigned';
      const ms = getElapsedMs(t.time_sessions);
      const hours = ms / (1000 * 60 * 60);
      const rate = t.hourly_rate_override ?? defaultRate;
      const rev = t.is_billable ? hours * rate : 0;

      const curr = map.get(clientName) || { name: clientName, hours: 0, revenue: 0, taskCount: 0 };
      curr.hours += Math.round(hours * 10) / 10;
      curr.revenue += Math.round(rev);
      curr.taskCount += 1;
      map.set(clientName, curr);
    });

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [filteredTasks, clients]);

  // Project Profitability & Budget Utilization
  const projectBreakdown = useMemo(() => {
    return projects.map((p) => {
      const pTasks = filteredTasks.filter((t) => t.project_id === p.id);
      const ms = pTasks.reduce((acc, t) => acc + getElapsedMs(t.time_sessions), 0);
      const actualHours = Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
      const budgetHours = p.budget_hours || 0;
      const overrun = budgetHours > 0 && actualHours > budgetHours;
      const utilization = budgetHours > 0 ? Math.round((actualHours / budgetHours) * 100) : 0;

      return {
        id: p.id,
        name: p.name,
        actualHours,
        budgetHours,
        utilization,
        overrun,
      };
    });
  }, [projects, filteredTasks]);

  // Employee Velocity
  const employeePerformance = useMemo(() => {
    return members
      .filter((m) => m.is_active)
      .map((m) => {
        const empTasks = filteredTasks.filter((t) => t.user_id === m.user_id);
        const ms = empTasks.reduce((acc, t) => acc + getElapsedMs(t.time_sessions), 0);
        const hours = Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
        const completed = empTasks.filter((t) => t.status === 'Finished').length;

        return {
          id: m.user_id,
          name: m.name,
          employeeType: m.employee_type,
          hours,
          completed,
          totalTasks: empTasks.length,
        };
      })
      .sort((a, b) => b.hours - a.hours);
  }, [members, filteredTasks]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

  const billableChartData = [
    { name: 'Billable Hours', value: financialSummary.billableHours, color: '#10b981' },
    { name: 'Non-Billable Hours', value: financialSummary.nonBillableHours, color: '#64748b' },
  ];

  const exportFinancialCSV = () => {
    const headers = ['Client', 'Logged Hours', 'Estimated Revenue ($)', 'Total Tasks'];
    const rows = clientBreakdown.map((c) => [
      `"${c.name}"`,
      c.hours,
      c.revenue,
      c.taskCount,
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', `profitability_report_${todayStr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Range Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/80 p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-600">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-lg tracking-tight">Productivity & Profitability Intelligence</h3>
            <p className="text-xs text-muted-foreground">
              Monitor billable revenue, client profit margins, and team efficiency
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={(val: any) => setTimeRange(val)}>
            <SelectTrigger className="w-36 h-8 text-xs font-semibold">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={exportFinancialCSV} className="h-8 text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border bg-gradient-to-br from-card to-emerald-500/5">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground mb-1">
            <span>Billable Revenue</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-foreground tracking-tight">
            ${financialSummary.totalRevenue.toLocaleString()}
          </div>
          <p className="text-[11px] text-emerald-600 font-semibold mt-1">
            {financialSummary.billableHours} billable hrs logged
          </p>
        </Card>

        <Card className="p-4 border bg-gradient-to-br from-card to-blue-500/5">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground mb-1">
            <span>Total Hours Tracked</span>
            <Clock className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-extrabold text-foreground tracking-tight">
            {financialSummary.totalHours}h
          </div>
          <p className="text-[11px] text-muted-foreground font-medium mt-1">
            Across {filteredTasks.length} tasks
          </p>
        </Card>

        <Card className="p-4 border bg-gradient-to-br from-card to-amber-500/5">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground mb-1">
            <span>Billable Utilization</span>
            <TrendingUp className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-foreground tracking-tight">
            {financialSummary.billablePercent}%
          </div>
          <p className="text-[11px] text-muted-foreground font-medium mt-1">
            Target industry bench: 75%+
          </p>
        </Card>

        <Card className="p-4 border bg-gradient-to-br from-card to-purple-500/5">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground mb-1">
            <span>Active Clients</span>
            <Briefcase className="h-4 w-4 text-purple-500" />
          </div>
          <div className="text-2xl font-extrabold text-foreground tracking-tight">
            {clientBreakdown.length}
          </div>
          <p className="text-[11px] text-muted-foreground font-medium mt-1">
            Top client: {clientBreakdown[0]?.name || 'N/A'}
          </p>
        </Card>
      </div>

      {/* Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Client Bar Chart */}
        <Card className="p-5 border space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Revenue Generated by Client ($)
            </h4>
            <Badge variant="outline" className="text-[10px]">Financial Return</Badge>
          </div>

          <div className="h-64 w-full">
            {clientBreakdown.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                No data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clientBreakdown.slice(0, 6)} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={40} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12, backgroundColor: 'rgba(23, 23, 23, 0.9)', color: '#fff' }}
                    formatter={(val: any) => [`$${val}`, 'Revenue']}
                  />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Billable vs Non-Billable Pie Chart */}
        <Card className="p-5 border space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-emerald-500" />
              Billable vs. Non-Billable Time Split
            </h4>
            <Badge variant="outline" className="text-[10px] font-mono">
              {financialSummary.billablePercent}% Billable
            </Badge>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {financialSummary.totalHours === 0 ? (
              <div className="text-xs text-muted-foreground">No hours logged yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={billableChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {billableChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: any) => [`${val} hrs`, 'Time']} />
                  <Legend verticalAlign="bottom" height={36} iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Project Budget & Overrun Tracking */}
      {projects.length > 0 && (
        <Card className="p-5 border space-y-4">
          <h4 className="font-bold text-sm flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            Project Budget & Hours Utilization
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projectBreakdown.map((p) => (
              <div key={p.id} className="p-3 rounded-xl border bg-card/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs truncate">{p.name}</span>
                  {p.overrun ? (
                    <Badge variant="destructive" className="text-[10px] gap-1 px-1.5 py-0 font-semibold">
                      <AlertCircle className="h-3 w-3" /> Over Budget
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {p.utilization}% used
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Actual: <strong>{p.actualHours}h</strong></span>
                  <span>Budget: {p.budgetHours > 0 ? `${p.budgetHours}h` : 'No limit'}</span>
                </div>

                {p.budgetHours > 0 && (
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        p.overrun ? 'bg-destructive' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(100, p.utilization)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Employee Productivity Leaderboard */}
      <Card className="p-5 border space-y-4">
        <h4 className="font-bold text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Team Productivity & Hours Leaderboard
        </h4>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b text-muted-foreground font-semibold">
                <th className="pb-2">Team Member</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Logged Hours</th>
                <th className="pb-2">Tasks Completed</th>
                <th className="pb-2">Total Tasks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {employeePerformance.map((emp) => (
                <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 font-semibold text-foreground">{emp.name}</td>
                  <td className="py-2.5 text-muted-foreground">{emp.employeeType}</td>
                  <td className="py-2.5 font-mono font-bold text-primary">{emp.hours}h</td>
                  <td className="py-2.5 font-medium text-emerald-600 dark:text-emerald-400">
                    {emp.completed} finished
                  </td>
                  <td className="py-2.5 text-muted-foreground">{emp.totalTasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default ProductivityProfitabilityDashboard;
