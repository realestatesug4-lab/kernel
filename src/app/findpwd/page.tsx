'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PublicShell } from '@/components/layout/PublicShell';
import { Button, Card, Field, Input } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { api } from '@/lib/api';
import { LOGIN_DOMAIN } from '@/lib/identity';
import { brand } from '@/lib/brand';

export default function FindPwdPage() {
  const toast = useToast();
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = handle.trim();
    if (!value) {
      toast.push('Enter your username or mobile number.', 'err');
      return;
    }

    setBusy(true);
    // Members no longer have an inbox, so resolve the handle first: only the
    // accounts created before the switch can be reset by email.
    const resolved = await api.auth.loginHandle(value);
    if (!resolved.ok) {
      setBusy(false);
      toast.push('No account matches that username or number.', 'err');
      return;
    }

    const email = resolved.data.email;
    if (email.endsWith(`@${LOGIN_DOMAIN}`)) {
      setBusy(false);
      toast.push(`Ask support to reset your password: ${brand.supportEmail}`, 'ok');
      return;
    }

    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/settings/security`,
    });
    setBusy(false);
    toast.push('If that account is registered, a reset link is on its way.', 'ok');
  }

  return (
    <PublicShell>
      <div className="py-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Reset password</h1>
        <p className="mt-1 text-sm text-muted">
          Enter your username and we&apos;ll help you back in.
        </p>
      </div>
      <Card className="p-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Username" hint="Or the mobile number on your account">
            <Input
              autoComplete="username"
              autoCapitalize="none"
              placeholder="your_username"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" size="lg" block loading={busy}>
            Continue
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Remembered it?{' '}
          <Link href="/login" className="font-semibold text-accent">
            Back to login
          </Link>
        </p>
      </Card>
    </PublicShell>
  );
}
