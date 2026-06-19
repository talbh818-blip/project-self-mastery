// ============================================================================
// SharePartnersSheet — "בחירת שותפים למסע".
// Opened when the user picks the "שותפים" habits-privacy option. Lists the
// other active users with a checkbox each; ticking shares the user's habits
// with that person (writes public.visibility_shares). A gender filter lets
// people share with only men / only women.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { X, Check, UserCircle, Search } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { fetchActiveProfiles, fetchMyHabitShares } from './queries';
import { setHabitShare } from './mutations';
import type { PublicProfileRow, Gender } from '../admin/types';

type Props = {
  open: boolean;
  onClose: () => void;
};

type GenderFilter = 'all' | Gender;

export function SharePartnersSheet({ open, onClose }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<PublicProfileRow[] | null>(null);
  const [shared, setShared] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<GenderFilter>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setRows(null);
    setError(null);
    setSearch('');
    setFilter('all');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    let cancelled = false;
    (async () => {
      try {
        const [all, mine] = await Promise.all([
          fetchActiveProfiles(),
          fetchMyHabitShares(user.id),
        ]);
        if (cancelled) return;
        setRows(all.filter((r) => !r.is_me));
        setShared(new Set(mine));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'שגיאה בטעינה');
        setRows([]);
      }
    })();

    return () => {
      cancelled = true;
      document.body.style.overflow = prevOverflow;
    };
  }, [open, user?.id]);

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = search.trim();
    return rows.filter((r) => {
      if (filter !== 'all' && r.gender !== filter) return false;
      if (q && !(r.display_name ?? '').includes(q)) return false;
      return true;
    });
  }, [rows, filter, search]);

  if (!open) return null;

  const toggle = async (id: string) => {
    if (!user || pending.has(id)) return;
    const willShare = !shared.has(id);
    // Optimistic update.
    setShared((prev) => {
      const next = new Set(prev);
      if (willShare) next.add(id);
      else next.delete(id);
      return next;
    });
    setPending((prev) => new Set(prev).add(id));
    try {
      await setHabitShare(user.id, id, willShare);
    } catch (e) {
      // Revert on failure.
      setShared((prev) => {
        const next = new Set(prev);
        if (willShare) next.delete(id);
        else next.add(id);
        return next;
      });
      setError(e instanceof Error ? e.message : 'שגיאה בשמירה');
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-modal-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-surface-card rounded-3xl shadow-xl flex flex-col max-h-[85vh] animate-modal-rise-in"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-surface-border shrink-0">
          <button
            onClick={onClose}
            className="p-1 text-ink-300 hover:text-ink-100"
            aria-label="סגור"
            type="button"
          >
            <X size={20} />
          </button>
          <h2 className="text-lg font-semibold text-ink-100">בחירת שותפים למסע</h2>
          <div className="w-7" />
        </header>

        {/* Controls: gender filter + search */}
        <div className="px-5 pt-3 pb-2 space-y-2 shrink-0">
          <div
            role="radiogroup"
            aria-label="סינון לפי מין"
            className="flex bg-surface-raised rounded-lg p-0.5 gap-0.5"
          >
            {(
              [
                { value: 'all' as GenderFilter, label: 'הכל' },
                { value: 'male' as GenderFilter, label: 'גברים' },
                { value: 'female' as GenderFilter, label: 'נשים' },
              ]
            ).map((opt) => {
              const active = filter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setFilter(opt.value)}
                  className={`flex-1 py-1.5 rounded-md text-xs transition-colors ${
                    active
                      ? 'bg-forest-700 text-on-accent font-semibold'
                      : 'text-ink-300 hover:text-ink-100'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search
              size={15}
              className="absolute top-1/2 -translate-y-1/2 right-3 text-ink-500 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם"
              className="w-full bg-surface-raised text-ink-100 placeholder-ink-500 rounded-lg pr-9 pl-3 py-2 text-sm border border-surface-border focus:outline-none focus:border-forest-500"
              dir="rtl"
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-400 light:text-red-700 bg-red-500/10 mx-5 my-1 rounded-lg px-3 py-2 shrink-0">
            {error}
          </p>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto themed-scroll px-2 pb-3">
          {rows === null && (
            <p className="text-sm text-ink-300 px-3 py-4">טוען…</p>
          )}
          {rows && visible.length === 0 && (
            <p className="text-sm text-ink-300 px-3 py-4">
              אין משתמשים מתאימים.
            </p>
          )}
          {visible.map((row) => {
            const checked = shared.has(row.id);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => toggle(row.id)}
                disabled={pending.has(row.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-raised/50 transition-colors disabled:opacity-60"
              >
                {row.avatar_url ? (
                  <img
                    src={row.avatar_url}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover border border-surface-border shrink-0"
                  />
                ) : (
                  <UserCircle
                    size={36}
                    strokeWidth={1.2}
                    className="text-ink-300 shrink-0"
                  />
                )}
                <span className="flex-1 min-w-0 text-right">
                  <span className="block text-sm text-ink-100 truncate">
                    {row.display_name || 'משתמש'}
                  </span>
                  {row.gender && (
                    <span className="block text-[11px] text-ink-500">
                      {row.gender === 'male' ? 'זכר' : 'נקבה'}
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center border transition-colors ${
                    checked
                      ? 'bg-forest-700 border-forest-700 text-on-accent'
                      : 'border-surface-border'
                  }`}
                >
                  {checked && <Check size={15} />}
                </span>
              </button>
            );
          })}
        </div>

        <footer className="px-5 py-3 border-t border-surface-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-forest-700 text-on-accent font-semibold rounded-xl py-2.5 transition-colors"
          >
            סיום
          </button>
        </footer>
      </div>
    </div>
  );
}
