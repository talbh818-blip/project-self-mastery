// ============================================================================
// DebugBadge — TEMPORARY dev-only on-screen diagnostic for the "loads from
// scratch" investigation. Shows the full-page-reload counter + recent cache
// events so we can read the cause from a single screenshot (no dev tools).
//
// REMOVE this component (and <DebugBadge/> in Layout) once diagnosis is done.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { dbgBootCount, dbgEvents, dbgSubscribe } from '../lib/debug';

export function DebugBadge() {
  const [, force] = useState(0);
  useEffect(() => dbgSubscribe(() => force((n) => n + 1)), []);

  // Count client-side tab switches. This component lives in the persistent
  // Layout, so the counter survives navigation (it only resets on a FULL page
  // reload — which is exactly the signal we're after).
  const { pathname } = useLocation();
  const navCount = useRef(0);
  const lastPath = useRef(pathname);
  if (lastPath.current !== pathname) {
    lastPath.current = pathname;
    navCount.current += 1;
  }

  if (!import.meta.env.DEV) return null;

  const boots = dbgBootCount();
  const events = dbgEvents();

  return (
    <div
      dir="ltr"
      className="fixed top-2 left-2 z-[200] pointer-events-none select-none rounded-lg bg-black/85 text-[10px] leading-tight text-white font-mono p-2 max-w-[78vw] shadow-lg"
    >
      <div className="font-bold text-[11px] mb-1">
        🧭 full reloads: <span className="text-yellow-300">{boots}</span>
        {'  ·  '}tab switches: <span className="text-sky-300">{navCount.current}</span>
      </div>
      {events.length === 0 ? (
        <div className="text-white/60">no events yet — switch tabs…</div>
      ) : (
        events.map((e, i) => (
          <div key={i} className="whitespace-nowrap overflow-hidden text-ellipsis">
            {e}
          </div>
        ))
      )}
    </div>
  );
}
