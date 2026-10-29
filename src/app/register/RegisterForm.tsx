'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/components/providers/SessionProvider';
import { PublicShell } from '@/components/layout/PublicShell';
import { Logo } from '@/components/layout/Logo';
import { Button, Card, Field, Input, PasswordInput } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { brand, copy } from '@/lib/brand';

export function RegisterForm({ defaultRef }: { defaultRef: string }) {
  const { signUp } = useSession();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [referral, setReferral] = useState(defaultRef);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) e.email = 'Enter a valid email.';
    if (password.length < 6) e.password = 'At least 6 characters.';
    if (!/^\d{4}$/.test(pin)) e.pin = 'PIN must be 4 digits.';
    return e;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const { error } = await signUp({
      email: email.trim(),
      password,
      pin,
      referral: referral.trim() || null,
    });
    setBusy(false);
    if (error === 'CONFIRM_EMAIL') {
      toast.push('Check your inbox to confirm your email, then sign in.', 'ok');
      return;
    }
    if (error) {
      toast.push(error, 'err');
      setErrs({ email: 'Could not create account. Try another email.' });
    }
  }

  return (
    <PublicShell>
      <div className="flex flex-col items-center gap-3 py-6">
        <Logo size={84} withWordmark={false} />
        <h1 className="text-2xl font-extrabold tracking-tight">{copy.register.title}</h1>
        <p className="text-sm text-muted">{copy.register.subtitle}</p>
      </div>

      <Card className="p-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email" error={errs.email}>
            <Input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" error={errs.password}>
            <PasswordInput
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label={copy.register.pinLabel} hint={copy.register.pinHint} error={errs.pin}>
            <Input
              inputMode="numeric"
              maxLength={4}
              placeholder="4-digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </Field>
          <Field label={copy.register.inviteLabel} hint={copy.register.inviteHint}>
            <div className="relative">
              <Input
                placeholder="Optional"
                autoCapitalize="characters"
                value={referral}
                onChange={(e) => setReferral(e.target.value.toUpperCase())}
                className={defaultRef ? 'border-accent/60' : ''}
              />
              {defaultRef && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent-2">
                  INVITED
                </span>
              )}
            </div>
          </Field>

          <Button type="submit" size="lg" block loading={busy}>
            Sign up
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          {copy.register.haveAccount}{' '}
          <Link href="/login" className="font-semibold text-accent-2">
            Sign in
          </Link>
        </p>
      </Card>

      <p className="mt-6 px-2 text-center text-xs leading-relaxed text-muted">
        {brand.legal.riskNotice}
      </p>
    </PublicShell>
  );
}
