// ============================================================================
// FeedbackAdminPanel — admin view of feedback + support tickets.
// ----------------------------------------------------------------------------
// Shown under the "פידבק" tab of the admin screen. Lists every ticket users
// submitted via the User screen's TicketSheet (writes to support_tickets).
// Admin can filter by kind (feedback/support) and status (open/closed), see
// who sent each one (avatar + name + email), and mark a ticket closed.
//
// RLS: admin select + update on support_tickets are granted in migration 0012;
// delete is intentionally NOT exposed so a ticket history is preserved.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  LifeBuoy,
  Mail,
  MessageSquare,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { CompassLoader } from '../../components/CompassLoader';
import { fetchAllTickets, updateTicketStatus } from './queries';
import type { TicketKind, TicketStatus, TicketWithSubmitter } from './types';

type KindFilter = 'all' | TicketKind;
// Status is binary on this table — either open or closed. We deliberately
// don't offer an "all" pill: every ticket belongs to exactly one of the two,
// so the count next to each chip already tells the admin how much they're
// not currently seeing.
type StatusFilter = TicketStatus;

export function FeedbackAdminPanel() {
  const [tickets, setTickets] = useState<TicketWithSubmitter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');

  const load = useCallback(async () => {
    setError(null);
    try {
      setTickets(await fetchAllTickets());
    } catch (e) {
      console.error('[admin/feedback] load failed:', e);
      setError(describeError(e, 'שגיאה בטעינה'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (!tickets) return null;
    return tickets.filter((t) => {
      if (kindFilter !== 'all' && t.kind !== kindFilter) return false;
      if (t.status !== statusFilter) return false;
      return true;
    });
  }, [tickets, kindFilter, statusFilter]);

  // Counts respect the kind filter so the (N) next to "פתוח"/"סגור" matches
  // the size of the list the admin is actually about to see when they click.
  const { openCount, closedCount } = useMemo(() => {
    const inKind = (tickets ?? []).filter(
      (t) => kindFilter === 'all' || t.kind === kindFilter,
    );
    return {
      openCount: inKind.filter((t) => t.status === 'open').length,
      closedCount: inKind.filter((t) => t.status === 'closed').length,
    };
  }, [tickets, kindFilter]);

  const handleToggleStatus = async (t: TicketWithSubmitter) => {
    setBusy(true);
    try {
      await updateTicketStatus(t.id, t.status === 'open' ? 'closed' : 'open');
      await load();
    } catch (e) {
      setError(describeError(e, 'שגיאה בעדכון'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* Filter row + refresh */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex gap-1.5 flex-wrap">
          <ChipBtn active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>
            הכל
          </ChipBtn>
          <ChipBtn
            active={kindFilter === 'feedback'}
            onClick={() => setKindFilter('feedback')}
          >
            <MessageSquare size={12} /> פידבק
          </ChipBtn>
          <ChipBtn
            active={kindFilter === 'support'}
            onClick={() => setKindFilter('support')}
          >
            <LifeBuoy size={12} /> תמיכה
          </ChipBtn>
          <span className="w-px bg-surface-border mx-1" />
          <ChipBtn
            active={statusFilter === 'open'}
            onClick={() => setStatusFilter('open')}
          >
            פתוח ({openCount})
          </ChipBtn>
          <ChipBtn
            active={statusFilter === 'closed'}
            onClick={() => setStatusFilter('closed')}
          >
            סגור ({closedCount})
          </ChipBtn>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100 disabled:opacity-50 shrink-0"
          aria-label="רענן"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-800/50 bg-red-950/30 text-red-400 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {tickets === null && !error && (
        <div className="py-8">
          <CompassLoader size="md" />
        </div>
      )}

      {visible && visible.length === 0 && (
        <div className="rounded-2xl border border-dashed border-surface-border bg-surface-card/40 px-4 py-10 text-center text-ink-300 text-sm">
          {tickets && tickets.length > 0
            ? 'אין הודעות שתואמות את הסינון.'
            : 'עוד לא התקבלו הודעות.'}
        </div>
      )}

      {visible && visible.length > 0 && (
        <ul className="space-y-3">
          {visible.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              busy={busy}
              onToggleStatus={() => void handleToggleStatus(t)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ChipBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
        active
          ? 'bg-forest-700 text-on-accent border-forest-700'
          : 'bg-surface-card text-ink-300 border-surface-border hover:text-ink-100'
      }`}
    >
      {children}
    </button>
  );
}

function TicketCard({
  ticket,
  busy,
  onToggleStatus,
}: {
  ticket: TicketWithSubmitter;
  busy: boolean;
  onToggleStatus: () => void;
}) {
  const submitter = ticket.submitter;
  const name = submitter?.display_name ?? submitter?.email ?? ticket.user_id.slice(0, 8);
  const initials = (name || '?').slice(0, 2).toUpperCase();
  const isOpen = ticket.status === 'open';
  const isFeedback = ticket.kind === 'feedback';

  // mailto: link so the admin can reply straight from the panel — uses the
  // ticket subject as the email subject and quotes the message body.
  const mailHref = submitter?.email
    ? (() => {
        const subjectLine = ticket.subject
          ? `Re: ${ticket.subject}`
          : isFeedback
            ? 'Re: פידבק על האפליקציה'
            : 'Re: בקשת תמיכה';
        const body = `\n\n---\n${ticket.message}`;
        return `mailto:${submitter.email}?subject=${encodeURIComponent(
          subjectLine,
        )}&body=${encodeURIComponent(body)}`;
      })()
    : null;

  return (
    <li
      className={`rounded-2xl border bg-surface-card px-4 py-3 ${
        isOpen ? 'border-surface-border' : 'border-surface-border/60 opacity-75'
      }`}
    >
      {/* Header: avatar + name + kind/status badges */}
      <div className="flex items-start gap-3">
        {submitter?.avatar_url ? (
          <img
            src={submitter.avatar_url}
            alt=""
            className="w-10 h-10 rounded-full object-cover shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-forest-700 text-on-accent text-sm font-bold flex items-center justify-center shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-ink-100 truncate">{name}</span>
            <span
              className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                isFeedback
                  ? 'border-forest-500/60 text-forest-400'
                  : 'border-amber-500/60 text-amber-400'
              }`}
            >
              {isFeedback ? <MessageSquare size={10} /> : <LifeBuoy size={10} />}
              {isFeedback ? 'פידבק' : 'תמיכה'}
            </span>
            {!isOpen && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border border-ink-500/60 text-ink-300">
                סגור
              </span>
            )}
          </div>
          {submitter?.email && (
            <a
              href={`mailto:${submitter.email}`}
              className="flex items-center gap-1 text-[11px] text-ink-300 hover:text-ink-100 truncate"
            >
              <Mail size={11} />
              <span className="truncate">{submitter.email}</span>
            </a>
          )}
        </div>
        <time className="text-[11px] text-ink-300 shrink-0 mt-0.5 tabular-nums">
          {relativeFromNow(ticket.created_at)}
        </time>
      </div>

      {/* Subject (optional) + message */}
      <div className="mt-3">
        {ticket.subject && (
          <div className="text-sm font-medium text-ink-100 mb-1">{ticket.subject}</div>
        )}
        <p className="text-sm text-ink-100/90 whitespace-pre-wrap break-words">
          {ticket.message}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {mailHref && (
          <a
            href={mailHref}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-surface-border text-ink-100 hover:bg-surface-raised transition-colors"
          >
            <Mail size={14} />
            השב באימייל
          </a>
        )}
        <button
          type="button"
          onClick={onToggleStatus}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isOpen
              ? 'border-forest-500/60 text-forest-400 hover:bg-forest-500/10'
              : 'border-surface-border text-ink-300 hover:bg-surface-raised'
          }`}
        >
          {isOpen ? (
            <>
              <CheckCircle2 size={14} />
              סמן כטופל
            </>
          ) : (
            <>
              <RotateCcw size={14} />
              פתח מחדש
            </>
          )}
        </button>
      </div>
    </li>
  );
}

// Pulled from the AdminScreen file rather than imported to keep this panel
// self-contained. Kept private — the only caller is the AdminScreen tab.
function describeError(e: unknown, fallback: string): string {
  if (!e) return fallback;
  if (typeof e === 'string') return e;
  if (typeof e === 'object') {
    const obj = e as Record<string, unknown>;
    const msg = typeof obj.message === 'string' ? obj.message : null;
    const code = typeof obj.code === 'string' ? obj.code : null;
    const hint = typeof obj.hint === 'string' ? obj.hint : null;
    const details = typeof obj.details === 'string' ? obj.details : null;
    const parts = [msg, code && `[${code}]`, hint, details].filter(Boolean);
    if (parts.length > 0) return parts.join(' — ');
  }
  return fallback;
}

function relativeFromNow(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return 'כעת';
  if (diffSec < 3600) return `לפני ${Math.floor(diffSec / 60)} ד׳`;
  if (diffSec < 86400) return `לפני ${Math.floor(diffSec / 3600)} שע׳`;
  const days = Math.floor(diffSec / 86400);
  if (days < 30) return `לפני ${days} ימים`;
  const months = Math.floor(days / 30);
  if (months < 12) return `לפני ${months} ח׳`;
  return `לפני ${Math.floor(months / 12)} שנים`;
}
