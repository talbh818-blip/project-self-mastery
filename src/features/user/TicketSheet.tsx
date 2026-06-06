// ============================================================================
// TicketSheet — combined bottom modal for sending feedback or a support
// request. Used to be two entry points; merged so the User screen can use
// a single icon button and let the user pick inside the sheet.
// Writes a row to public.support_tickets; admins see it in the ניהול panel.
// ============================================================================
import { useEffect, useState } from 'react';
import { X, Send, Check, MessageSquare, LifeBuoy } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { submitTicket } from './mutations';

type Kind = 'feedback' | 'support';

type Props = {
  open: boolean;
  /** Optional preselected kind when opening; defaults to 'feedback'. */
  initialKind?: Kind;
  onClose: () => void;
};

const MAX_MESSAGE = 2000;

export function TicketSheet({ open, initialKind = 'feedback', onClose }: Props) {
  const { user } = useAuth();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setSubject('');
    setMessage('');
    setWorking(false);
    setError(null);
    setDone(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, initialKind]);

  if (!open) return null;

  const isFeedback = kind === 'feedback';
  const placeholder = isFeedback
    ? 'מה אהבת? מה היה אפשר לשפר? כל מחשבה עוזרת.'
    : 'תאר בקצרה במה אתה צריך עזרה.';

  const canSubmit = message.trim().length > 0 && !working && !done;

  const handleSubmit = async () => {
    if (!user || !canSubmit) return;
    setWorking(true);
    setError(null);
    try {
      await submitTicket({
        userId: user.id,
        kind,
        subject: subject.trim() || null,
        message: message.trim(),
      });
      setDone(true);
      window.setTimeout(() => {
        onClose();
      }, 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשליחה');
      setWorking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-modal-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-surface-card rounded-3xl shadow-xl flex flex-col animate-modal-rise-in"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-surface-border">
          <button
            onClick={onClose}
            className="p-1 text-ink-300 hover:text-ink-100"
            aria-label="סגור"
            type="button"
          >
            <X size={20} />
          </button>
          <h2 className="text-lg font-semibold text-ink-100">פידבק ועזרה</h2>
          <div className="w-7" />
        </header>

        {done ? (
          <div className="px-5 py-10 flex flex-col items-center gap-3 text-center">
            <span className="w-12 h-12 rounded-full bg-forest-700/20 flex items-center justify-center">
              <Check size={28} className="text-forest-500" />
            </span>
            <p className="text-ink-100 font-medium">תודה! ההודעה נשלחה.</p>
            <p className="text-ink-300 text-xs">נחזור אליך בהקדם.</p>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-3">
            {/* Kind selector */}
            <div
              role="radiogroup"
              aria-label="סוג ההודעה"
              className="flex bg-surface-raised rounded-xl p-1 gap-1"
            >
              <KindOption
                label="פידבק"
                icon={<MessageSquare size={16} />}
                active={kind === 'feedback'}
                onClick={() => setKind('feedback')}
              />
              <KindOption
                label="בקש תמיכה"
                icon={<LifeBuoy size={16} />}
                active={kind === 'support'}
                onClick={() => setKind('support')}
              />
            </div>

            <div>
              <label className="block text-xs text-ink-300 mb-1.5">
                נושא (אופציונלי)
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={120}
                placeholder={isFeedback ? 'רעיון, באג, חוויה...' : 'נושא הבקשה'}
                className="w-full bg-surface-raised text-ink-100 placeholder-ink-500 rounded-xl px-3 py-2 text-sm border border-surface-border focus:outline-none focus:border-forest-500"
                dir="rtl"
              />
            </div>

            <div>
              <label className="block text-xs text-ink-300 mb-1.5">
                הודעה
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
                placeholder={placeholder}
                rows={6}
                className="w-full bg-surface-raised text-ink-100 placeholder-ink-500 rounded-xl px-3 py-2 text-sm border border-surface-border focus:outline-none focus:border-forest-500 resize-none"
                dir="rtl"
              />
              <div className="text-[10px] text-ink-500 text-left mt-1">
                {message.length} / {MAX_MESSAGE}
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-950/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full bg-forest-700 disabled:bg-forest-700/40 disabled:text-cream-50/60 text-on-accent font-medium rounded-xl py-2.5 flex items-center justify-center gap-2 transition-colors"
            >
              <Send size={16} />
              {working ? 'שולח…' : 'שלח'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function KindOption({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-forest-700 text-on-accent'
          : 'text-ink-300 hover:text-ink-100'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
