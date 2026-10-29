'use client';

import { Megaphone } from 'lucide-react';
import { InnerPage } from '@/components/layout/InnerPage';
import { Badge, Card, EmptyState, Spinner } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

type Notice = { id: string; title: string; body: string; kind: string; created_at: string };

const TONE: Record<string, 'accent' | 'pos' | 'warn' | 'neutral'> = {
  update: 'accent',
  promotion: 'pos',
  maintenance: 'warn',
  system: 'neutral',
};

export default function NoticePage() {
  const { data, loading } = useAsync<Notice[]>(() => api.notices(), []);

  return (
    <InnerPage title="Notices">
      <div className="space-y-3">
        {loading ? (
          <div className="grid place-items-center py-16">
            <Spinner className="size-7" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <EmptyState title="No notices yet" hint="Product updates and announcements appear here." />
        ) : (
          (data ?? []).map((n) => (
            <Card key={n.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-2">
                  <Megaphone className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={TONE[n.kind] ?? 'neutral'}>{n.kind}</Badge>
                    <span className="shrink-0 text-[10px] text-muted">{fmtDateTime(n.created_at)}</span>
                  </div>
                  <h2 className="mt-1.5 text-sm font-bold">{n.title}</h2>
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted">{n.body}</p>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </InnerPage>
  );
}
