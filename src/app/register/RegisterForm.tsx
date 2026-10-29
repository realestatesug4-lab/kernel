'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/components/providers/SessionProvider';
import { PublicShell } from '@/components/layout/PublicShell';
import { Logo } from '@/components/layout/Logo';
import { Button, Card, Field, Input, PasswordInput } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { brand, copy } from '@/lib/brand';
import { normalizeMsisdn } from '@/lib/msisdn';
import { normalizeUsername, usernameError } from '@/lib/identity';
import { api } from '@/lib/api';

export function RegisterForm({ defaultRef }: { defaultRef: string }) {
  const { signUp } = useSession();
  const toast = useToast();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [referral, setReferral] = useState(defaultRef);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = 'Enter your full name.';
    const usernameIssue = usernameError(username);
    if (usernameIssue) e.username = usernameIssue;
    if (!normalizeMsisdn(phone)) e.phone = 'Enter a valid Ugandan mobile number.';
    if (password.length < 6) e.password = 'At least 6 characters.';
    return e;
  }

  /** Checks the handle while the member fills the rest of the form. */
  async function checkUsername() {
    const handle = normalizeUsername(username);
    if (usernameError(handle)) return;
    const res = await api.auth.handleAvailable(handle, '');
    if (res.ok && !res.data.username_free) {
      setErrs((prev) => ({ ...prev, username: 'That username is already taken.' }));
    }
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const { error } = await signUp({
      name: name.trim(),
      username: normalizeUsername(username),
      phone: normalizeMsisdn(phone) ?? phone.trim(),
      password,
      referral: referral.trim().toUpperCase() || null,
    });
    setBusy(false);
    if (error) {
      toast.push(error, 'err');
      setErrs({ username: 'Could not create the account with those details.' });
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
          <Field label={copy.register.nameLabel} error={errs.name}>
            <Input
              autoComplete="name"
              placeholder="Joel Kamya"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={copy.register.usernameLabel} hint={copy.register.usernameHint} error={errs.username}>
            <Input
              autoComplete="username"
              autoCapitalize="none"
              placeholder="joel_k"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
              onBlur={checkUsername}
            />
          </Field>
          <Field label={copy.register.phoneLabel} hint={copy.register.phoneHint} error={errs.phone}>
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0770 000 000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
