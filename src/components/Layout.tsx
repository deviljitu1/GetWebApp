import { useState } from 'react';
import { Outlet, NavLink as RouterNavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, Users, LogOut, Clock, Menu, X, ChevronRight, Activity, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import LunaAssistant from '@/components/LunaAssistant';
import { AIAssistantWidget } from '@/components/AIAssistantWidget';
import NotificationSettings from '@/components/NotificationSettings';
import OfflineBanner from '@/components/OfflineBanner';

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);


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
                onClick={() => setMobileOpen(false)}
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

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="fixed inset-y-0 left-0 w-[min(18rem,calc(100vw-3rem))] h-full shadow-2xl animate-in slide-in-from-left duration-300">
            <SidebarContent />
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-[-3rem] text-foreground bg-background/50 rounded-full"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden relative">
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
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
              <Menu className="h-6 w-6" />
            </Button>
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
      </div>
      {/* Floating AI assistant — all users */}
      <LunaAssistant />
      <AIAssistantWidget />
    </div>
  );
};

export default Layout;
