'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { InnerPage } from '@/components/layout/InnerPage';
import { Button, Card, Field, Input, PasswordInput } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { useSession } from '@/components/providers/SessionProvider';
import { api } from '@/lib/api';

export default function SecurityPage() {
  const toast = useToast();
  const { refresh } = useSession();

  const [pw, setPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pin, setPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) return toast.push('Use at least 6 characters.', 'err');
    setPwBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) toast.push(error.message, 'err');
    else {
      // Keep the console's copy in step with the new hash (0016).
      void supabase.rpc('km_sync_login_password', { p_password: pw });
      toast.push('Password updated.', 'ok');
      setPw('');
    }
  }

  async function changePin(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) return toast.push('PIN must be 4 digits.', 'err');
    setPinBusy(true);
    const res = await api.account.setPin(pin);
    setPinBusy(false);
    if (res.ok) {
      toast.push('Security PIN updated.', 'ok');
      setPin('');
      refresh();
    } else toast.push(res.message, 'err');
  }

  return (
    <InnerPage title="Security">
      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Change password</h2>
          <form onSubmit={changePassword} className="space-y-3">
            <Field label="New password">
              <PasswordInput
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </Field>
            <Button type="submit" block loading={pwBusy}>
              Update password
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Security PIN</h2>
          <p className="mb-3 text-xs text-muted">Authorises withdrawals and transfers.</p>
          <form onSubmit={changePin} className="space-y-3">
            <Field label="New 4-digit PIN">
              <Input
                inputMode="numeric"
                type="password"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </Field>
            <Button type="submit" block variant="secondary" loading={pinBusy}>
              Save PIN
            </Button>
          </form>
        </Card>
      </div>
    </InnerPage>
  );
}
