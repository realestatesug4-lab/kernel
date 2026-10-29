'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Snapshot<T> = { key: string; data: T | null; error: string | null };

/**
 * Minimal async data hook: runs `loader` on mount, whenever `deps` change, or
 * after reload(). `deps` are serialised into a key so callers can pass plain
 * values (ids, levels, counters) instead of memoised callbacks.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const key = deps.map((d) => String(d)).join('|');
  const [nonce, setNonce] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(null);
  const loaderRef = useRef(loader);

  // Keep the latest loader without making it a dependency (callers re-create it
  // on every render, which would otherwise re-trigger the fetch forever).
  useEffect(() => {
    loaderRef.current = loader;
  });

  const requestKey = `${key}#${nonce}`;

  useEffect(() => {
    let active = true;
    // State is only written from the promise callbacks, never synchronously in
    // the effect body — that keeps React from cascading renders on mount.
    loaderRef.current()
      .then((data) => {
        if (active) setSnapshot({ key: requestKey, data, error: null });
      })
      .catch((e: unknown) => {
        if (active) {
          setSnapshot({ key: requestKey, data: null, error: e instanceof Error ? e.message : String(e) });
        }
      });

    return () => {
      active = false;
    };
  }, [requestKey]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const current = snapshot && snapshot.key === requestKey ? snapshot : null;

  return {
    /** Last resolved value (previous data stays visible while reloading). */
    data: snapshot?.data ?? null,
    loading: !current,
    error: current?.error ?? null,
    reload,
  };
}
