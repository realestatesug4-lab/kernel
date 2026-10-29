'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PublicShell } from '@/components/layout/PublicShell';
import { Button, Card, Field, Input } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';

export default function FindPwdPage() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/settings/security`,
    });
    setBusy(false);
    toast.push('If that email is registered, a reset link is on its way.', 'ok');
  }

  return (
    <PublicShell>
      <div className="py-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Reset password</h1>
        <p className="mt-1 text-sm text-muted">
          Enter your account email and we’ll send you a reset link.
        </p>
      </div>
      <Card className="p-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" size="lg" block loading={busy}>
            Send reset link
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
