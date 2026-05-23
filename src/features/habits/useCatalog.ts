import { useEffect, useState } from 'react';
import { fetchCatalog } from './queries';
import type { CatalogItem } from './types';

// Module-level cache so the catalog isn't re-fetched on every picker open.
let cachedCatalog: CatalogItem[] | null = null;
let inflight: Promise<CatalogItem[]> | null = null;

export function clearCatalogCache() {
  cachedCatalog = null;
  inflight = null;
}

type State =
  | { status: 'loading'; items: null; error: null }
  | { status: 'ready'; items: CatalogItem[]; error: null }
  | { status: 'error'; items: null; error: string };

export function useCatalog(enabled: boolean = true): State {
  const [state, setState] = useState<State>(
    cachedCatalog
      ? { status: 'ready', items: cachedCatalog, error: null }
      : { status: 'loading', items: null, error: null },
  );

  useEffect(() => {
    if (!enabled) return;
    if (cachedCatalog) {
      setState({ status: 'ready', items: cachedCatalog, error: null });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', items: null, error: null });
    const p = inflight ?? (inflight = fetchCatalog());
    p.then((items) => {
      cachedCatalog = items;
      inflight = null;
      if (!cancelled) setState({ status: 'ready', items, error: null });
    }).catch((e: unknown) => {
      inflight = null;
      if (cancelled) return;
      const msg = e instanceof Error ? e.message : 'שגיאה בטעינת המאגר';
      setState({ status: 'error', items: null, error: msg });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
