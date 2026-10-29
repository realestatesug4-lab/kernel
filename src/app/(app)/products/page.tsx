'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, Clock, Coins, Wallet } from 'lucide-react';
import { AppHeader } from '@/components/layout/TopBar';
import { Badge, Card, Spinner } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { api } from '@/lib/api';
import { fallbackProducts } from '@/lib/catalog';
import { fmtUGX } from '@/lib/format';
import type { Product } from '@/lib/types';

export default function ProductsPage() {
  const { data, loading } = useAsync<Product[]>(() => api.products.list(), []);
  const list = data && data.length ? data : fallbackProducts;

  return (
    <>
      <AppHeader
        right={
          <Link href="/wallet" aria-label="Wallet" className="grid size-9 place-items-center rounded-full hover:bg-surface-2">
            <Wallet className="size-5" />
          </Link>
        }
      />
      <div className="space-y-4 px-4 pt-4">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Mining packs</h1>
          <p className="mt-0.5 text-xs text-muted">
            Buy once, earn every 24 hours for the pack duration. Payouts are automatic.
          </p>
        </div>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Spinner className="size-7" />
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((p) => (
              <Link key={p.id} href={`/products/${p.no}`} className="block">
                <Card className="overflow-hidden p-0">
                  <div className="relative h-28 w-full">
                    <Image src={p.image} alt={p.name} fill sizes="480px" className="object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                    <div className="absolute inset-x-3 bottom-2.5 flex items-end justify-between">
                      <div>
                        <Badge tone="accent">#{p.no} · {p.tier}</Badge>
                        <p className="mt-1 text-base font-extrabold text-white">{p.name}</p>
                      </div>
                      <p className="tnum text-right text-sm font-bold text-accent-2">
                        +{fmtUGX(p.daily)}
                        <span className="block text-[10px] font-medium text-white/70">per day</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 px-3.5 py-3">
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted">Price</p>
                      <p className="tnum text-sm font-bold">{fmtUGX(p.price)} UGX</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted">Duration</p>
                      <p className="tnum inline-flex items-center gap-1 text-sm font-bold">
                        <Clock className="size-3.5 text-accent-2" />
                        {p.duration_days} days
                      </p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted">Total return</p>
                      <p className="tnum inline-flex items-center gap-1 text-sm font-bold text-accent-2">
                        <Coins className="size-3.5" />
                        {fmtUGX(p.total)}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-muted" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <Card className="p-4">
          <h2 className="text-sm font-bold">How payouts work</h2>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
            <li>· Each 24-hour cycle starts from the exact minute you invest.</li>
            <li>· Daily earnings land in your available balance automatically.</li>
            <li>· The pack shows live progress until its final cycle.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
