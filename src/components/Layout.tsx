import { Outlet, NavLink as RouterNavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, Users, LogOut, Clock, ChevronRight, Activity, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AIAssistantWidget } from '@/components/AIAssistantWidget';
import NotificationSettings from '@/components/NotificationSettings';
import OfflineBanner from '@/components/OfflineBanner';

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/team-status', icon: Activity, label: 'Team Status' },
    { to: '/chat', icon: MessageSquare, label: 'Chat' },
    ...(user?.role === 'admin' ? [{ to: '/members', icon: Users, label: 'Team' }] : []),
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar-background/95 backdrop-blur-xl border-r border-sidebar-border shadow-lg">
      <div className="p-6">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Clock className="h-6 w-6 text-primary" />
          </div>
          <span className="text-xl font-bold tracking-tight text-sidebar-foreground">GetWebApp</span>
        </div>
      </div>

      <div className="px-4 py-2">
        <p className="px-4 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider mb-2">Menu</p>
        <nav className="space-y-1">
          {navItems.map(item => {
            const isActive = location.pathname === item.to;
            return (
              <RouterNavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'group flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className={cn("h-5 w-5", isActive ? "text-primary-foreground" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground")} />
                  {item.label}
                </div>
                {isActive && <ChevronRight className="h-4 w-4 opacity-50" />}
              </RouterNavLink>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-4 m-2">
        <div className="bg-sidebar-accent/50 rounded-2xl p-4 border border-sidebar-border/50">
          <div className="flex items-center gap-3 mb-4">
            <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
              <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.name}`} />
              <AvatarFallback className="bg-primary/10 text-primary font-bold">
                {user?.name?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-sidebar-foreground">{user?.name}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate capitalize">{user?.role}</p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20 border-sidebar-border/60"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-72 flex-col shrink-0 z-20">
        <SidebarContent />
      </aside>

      <div className="min-w-0 flex-1 flex flex-col overflow-hidden relative">
        <OfflineBanner />
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b bg-card/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <span className="font-bold">GetWebApp</span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationSettings />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
                  <Avatar className="h-8 w-8 border border-border">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.name}`} />
                    <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1.5 text-sm font-medium">{user?.name}</div>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>


        <main className="flex-1 overflow-auto bg-muted/20 relative">
          {/* Desktop floating settings */}
          <div className="hidden md:flex absolute top-4 right-6 z-20">
            <NotificationSettings />
          </div>
          {/* Subtle background pattern for main content */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
          <div className="relative px-3 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-6 md:p-8 max-w-7xl mx-auto w-full min-w-0 overflow-x-hidden">
            <Outlet />
          </div>
        </main>
        <nav aria-label="Main navigation" className="md:hidden shrink-0 border-t bg-card/95 px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          <div className="flex items-stretch justify-around gap-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <RouterNavLink
                key={to}
                to={to}
                end
                className={({ isActive }) => cn(
                  'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-medium leading-tight transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground active:bg-muted'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="truncate max-w-full">{label}</span>
              </RouterNavLink>
            ))}
          </div>
        </nav>
      </div>
      {/* Unified AI Assistant for all users */}
      <AIAssistantWidget />
    </div>
  );
};

export default Layout;
