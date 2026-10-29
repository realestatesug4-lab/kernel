'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';

type SessionCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (input: {
    email: string;
    password: string;
    pin: string;
    referral: string | null;
  }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<SessionCtx | null>(null);

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used within <SessionProvider>');
  return v;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      router.refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase, router]);

  const signIn = useCallback<SessionCtx['signIn']>(
    async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      // Idempotent: provisions the profile if the sign-up trigger never fired.
      await api.auth.bootstrap(null);
      router.push('/home');
      router.refresh();
      return { error: null };
    },
    [supabase, router],
  );

  const signUp = useCallback<SessionCtx['signUp']>(
    async ({ email, password, pin, referral }) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { pin, referral_code: referral ?? null } },
      });
      if (error) return { error: error.message };
      if (!data.session) {
        return { error: 'CONFIRM_EMAIL' };
      }
      // Profile + referral links are provisioned server-side (trigger or RPC).
      await api.auth.bootstrap(referral);
      router.push('/home');
      router.refresh();
      return { error: null };
    },
    [supabase, router],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }, [supabase, router]);

  const refresh = useCallback(async () => {
    await supabase.auth.getSession().then(({ data }) => setSession(data.session));
    router.refresh();
  }, [supabase, router]);

  const value: SessionCtx = {
    session,
    user: session?.user ?? null,
    loading,
    signIn,
    signUp,
    signOut,
    refresh,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
