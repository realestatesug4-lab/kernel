'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/components/providers/SessionProvider';
import { PublicShell } from '@/components/layout/PublicShell';
import { Logo } from '@/components/layout/Logo';
import { Button, Card, Field, Input, PasswordInput } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { SetupNotice } from '@/components/SetupNotice';
import { brand, copy } from '@/lib/brand';

export default function LoginPage() {
  const { signIn } = useSession();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!email || !password) {
      setErr('Enter your email and password.');
      return;
    }
    setBusy(true);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) {
      setErr('Invalid email or password.');
      toast.push(error, 'err');
    }
  }

  return (
    <PublicShell>
      <div className="flex flex-col items-center gap-3 py-8">
        <Logo size={84} withWordmark={false} />
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">
            <span className="text-white">KERNEL</span>
            <span className="brand-text">MINERS</span>
          </h1>
          <p className="mt-1 text-sm text-muted">{copy.login.subtitle}</p>
        </div>
      </div>

      <SetupNotice />
      <Card className="p-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" error={err}>
            <PasswordInput
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <div className="flex justify-end">
            <Link href="/findpwd" className="text-sm font-medium text-accent-2">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" size="lg" block loading={busy}>
            Sign in
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          {copy.login.noAccount}{' '}
          <Link href="/register" className="font-semibold text-accent-2">
            Create one
          </Link>
        </p>
      </Card>

      <p className="mt-6 px-2 text-center text-xs leading-relaxed text-muted">
        {brand.legal.riskNotice}
      </p>
    </PublicShell>
  );
}
