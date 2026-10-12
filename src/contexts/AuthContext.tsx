import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AuthUser, AppRole, MemberType } from '@/types';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Helper to fetch profile and set user
    const fetchAndSetUser = async (session: any) => {
      if (!session?.user) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Profile fetch error:", profileError);
          // Don't log out yet, maybe just network blip? But we can't set user fully.
        }

        const { data: roleRows, error: roleError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id);

        if (roleError) console.error("Role fetch error:", roleError);

        const hasAdminRole = roleRows?.some(r => r.role === 'admin');
        const userRole: AppRole = hasAdminRole ? 'admin' : (roleRows?.[0]?.role as AppRole) || 'employee';

        if (profile) {
          if (!profile.is_active) {
            await supabase.auth.signOut();
            setUser(null);
            setLoading(false);
            return;
          }

          setUser({
            id: profile.id,
            userId: profile.user_id,
            name: profile.name,
            email: session.user.email || '',
            memberType: (profile.employee_type as MemberType) || 'Other',
            isActive: profile.is_active,
            role: userRole,
          });
        } else {
          // Profile missing - unexpected state for logged in user if seed ran?
          // Or maybe it's a new user who hasn't completed setup.
          console.warn("User logged in but no profile found.");
        }
      } catch (e) {
        console.error("Error in fetchAndSetUser", e);
      } finally {
        setLoading(false);
      }
    };

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetchAndSetUser(session);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // If we already have a user and session ID matches, maybe we don't need to re-fetch *everything* aggressively,
      // but simpler to just re-fetch to be safe on token refresh etc.
      fetchAndSetUser(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    // Check is_active
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      return { error: 'Your account has been deactivated. Contact your administrator.' };
    }

    return { error: null };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};
