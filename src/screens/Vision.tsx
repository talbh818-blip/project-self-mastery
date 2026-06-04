// ============================================================================
// Vision screen — yearly / monthly / weekly journaling.
// ----------------------------------------------------------------------------
// Navigation is a single coherent position in the year→month→week pyramid:
// one `anchor` Date + a zoom `level`. The VisionNav header renders a
// breadcrumb (tap a parent level to zoom OUT) and a period stepper
// (swipe / arrows to move within the level). Everything below derives from
// (level, anchor), so the breadcrumb is always internally consistent — even
// when stepping a week crosses a month/year boundary.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { VisionEditor } from '../features/vision/VisionEditor';
import { VisionNav } from '../features/vision/VisionNav';
import { useVisionEntry } from '../features/vision/useVisionEntry';
import { CompassLoader } from '../components/CompassLoader';
import {
  addAnchor,
  getPeriodKey,
  isFuturePeriod,
  type VisionScope,
} from '../features/vision/period';

// Nesting depth — drives the editor's zoom direction on level switches.
const SCOPE_DEPTH: Record<VisionScope, number> = {
  yearly: 0,
  monthly: 1,
  weekly: 2,
};

const PLACEHOLDERS: Record<VisionScope, string> = {
  yearly: 'מה החזון שלך לשנה הזו? מה הכי חשוב לך להשיג?',
  monthly: 'איך אתה רוצה שהחודש הזה ייראה?',
  weekly: 'מה המיקוד שלך לשבוע הזה?',
};

export function Vision() {
  const today = useMemo(() => new Date(), []);

  // Single position in the pyramid: a zoom level + an anchor date.
  const [level, setLevel] = useState<VisionScope>('yearly');
  const [anchor, setAnchor] = useState<Date>(today);

  const periodKey = getPeriodKey(level, anchor);
  const locked = isFuturePeriod(level, periodKey);

  // Editor zoom direction: deeper level (year→month→week) = zoom IN, broader
  // = zoom OUT. Compared to the previous level; ref updates after commit.
  const prevLevelRef = useRef<VisionScope>(level);
  const zoomDir: 'in' | 'out' =
    SCOPE_DEPTH[level] >= SCOPE_DEPTH[prevLevelRef.current] ? 'in' : 'out';
  useEffect(() => {
    prevLevelRef.current = level;
  }, [level]);

  const { entry, loading, status, scheduleSave, setDocumentDate } =
    useVisionEntry(level, periodKey);

  // Default the DateBar to today when there's no entry yet.
  const todayIso = useMemo(() => toIsoDate(today), [today]);
  const documentDate = entry?.document_date ?? todayIso;

  // Step within the current level. Never step into the future.
  const step = (delta: number) => {
    setAnchor((a) => {
      const next = addAnchor(level, a, delta);
      if (delta > 0 && isFuturePeriod(level, getPeriodKey(level, next))) {
        return a;
      }
      return next;
    });
  };
  const goToday = () => setAnchor(today);

  // Zoom IN: dive into a concrete child period (a month from yearly, a week
  // from monthly). Sets the anchor first, then the deeper level.
  const drill = (targetLevel: VisionScope, targetAnchor: Date) => {
    setAnchor(targetAnchor);
    setLevel(targetLevel);
  };

  return (
    // -mt-3 tightens the gap with the global brand header.
    <section className="-mt-3 pb-3">
      <VisionNav
        level={level}
        anchor={anchor}
        today={today}
        onSetLevel={setLevel}
        onStep={step}
        onToday={goToday}
        onDrill={drill}
      />

      {/* Body — flat-top writing surface flush under the nav's divider. */}
      {locked ? (
        <LockedNotice level={level} />
      ) : loading ? (
        <div className="vision-page py-10">
          <CompassLoader size="md" />
        </div>
      ) : (
        <VisionEditor
          // resetKey re-mounts the editor when the period changes so it loads
          // the right document.
          resetKey={`${level}:${periodKey}`}
          scope={level}
          zoomDir={zoomDir}
          initialContent={entry?.content ?? null}
          placeholder={PLACEHOLDERS[level]}
          saveStatus={status}
          documentDate={documentDate}
          onDateChange={(iso) => void setDocumentDate(iso)}
          onChange={scheduleSave}
        />
      )}
    </section>
  );
}

/** Local-date ISO ('YYYY-MM-DD') — sidesteps timezone drift from toISOString(). */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function LockedNotice({ level }: { level: VisionScope }) {
  const noun =
    level === 'yearly' ? 'השנה' : level === 'monthly' ? 'החודש' : 'השבוע';
  return (
    <div className="vision-page text-center">
      <div className="py-8">
        <Lock size={28} className="text-ink-500 mx-auto mb-3" />
        <p className="text-ink-100 font-medium">{noun} עוד לא הגיע</p>
        <p className="text-ink-300 text-sm mt-1">
          אפשר לכתוב חזון רק לתקופה שכבר התחילה.
        </p>
      </div>
    </div>
  );
}
