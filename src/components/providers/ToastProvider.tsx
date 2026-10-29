'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

type Toast = { id: number; msg: string; tone: 'ok' | 'err' | 'info' };
type ToastCtx = { push: (msg: string, tone?: Toast['tone']) => void };

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used within <ToastProvider>');
  return v;
}

const ICON = {
  ok: CheckCircle2,
  err: AlertCircle,
  info: Info,
};
const TONE: Record<Toast['tone'], string> = {
  ok: 'text-pos',
  err: 'text-neg',
  info: 'text-accent',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((msg: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, msg, tone }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3600);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 mx-auto flex max-w-[440px] flex-col items-center gap-2 px-4">
        {items.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div
              key={t.id}
              className="animate-rise pointer-events-auto flex w-full items-start gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-[var(--shadow-lg)]"
            >
              <Icon className={`mt-0.5 size-5 shrink-0 ${TONE[t.tone]}`} />
              <span className="text-fg">{t.msg}</span>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
