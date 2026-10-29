'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { InnerPage } from '@/components/layout/InnerPage';
import { Card } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { api } from '@/lib/api';

const LANGS = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'zh', label: 'Chinese', native: '中文' },
  { code: 'es', label: 'Spanish', native: 'Español' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
  { code: 'vi', label: 'Vietnamese', native: 'Tiếng Việt' },
];

export default function LanguagePage() {
  const toast = useToast();
  const [active, setActive] = useState('en');

  async function pick(code: string) {
    setActive(code);
    const res = await api.account.setLocale(code);
    toast.push(res.ok ? 'Language saved.' : 'Saved for this device only.', res.ok ? 'ok' : 'info');
  }

  return (
    <InnerPage title="Language">
      <Card className="divide-y divide-[var(--line)] p-0">
        {LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => pick(l.code)}
            className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-surface-2"
          >
            <span className="text-left">
              <span className="block text-sm font-medium">{l.label}</span>
              <span className="block text-xs text-muted">{l.native}</span>
            </span>
            {active === l.code && <Check className="size-5 text-accent" />}
          </button>
        ))}
      </Card>
      <p className="mt-4 px-2 text-center text-xs text-muted">
        Full translations ship with the Kernel brand package.
      </p>
    </InnerPage>
  );
}
