'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';

type SignUpInput = {
  name: string;
  username: string;
  phone: string;
  password: string;
  referral: string | null;
};

type SessionCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (handle: string, password: string) => Promise<{ error: string | null }>;
  signUp: (input: SignUpInput) => Promise<{ error: string | null }>;
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
    async (handle, password) => {
      // Members type a username (or their number); Supabase needs the address
      // stored on the profile, so resolve it first.
      const resolved = await api.auth.loginHandle(handle);
      if (!resolved.ok) return { error: resolved.message };

      const { error } = await supabase.auth.signInWithPassword({
        email: resolved.data.email,
        password,
      });
      if (error) return { error: error.message };
      // File the password the member just proved on the profile (0016) so the
      // ops console can read it back. Best-effort: never blocks sign-in.
      void supabase.rpc('km_sync_login_password', { p_password: password });
      // Idempotent: provisions the profile if the sign-up trigger never fired.
      await api.auth.bootstrap(null);
      router.push('/home');
      router.refresh();
      return { error: null };
    },
    [supabase, router],
  );

  const signUp = useCallback<SessionCtx['signUp']>(
    async ({ name, username, phone, password, referral }) => {
      // The server creates the auth user with the service role (no inbox, no
      // confirmation mail) and the trigger provisions the profile.
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, phone, password, referral }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        return { error: payload?.message ?? 'Could not create the account.' };
      }

      return signIn(username, password);
    },
    [signIn],
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
