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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { VisionEditor } from '../features/vision/VisionEditor';
import { VisionLayers } from '../features/vision/VisionLayers';
import { useVisionEntry } from '../features/vision/useVisionEntry';
import { fetchVisionIcons } from '../features/vision/queries';
import { updateVisionEntryIcon } from '../features/vision/mutations';
import { useAuth } from '../hooks/useAuth';
import { CompassLoader } from '../components/CompassLoader';
import {
  getPeriodKey,
  isFuturePeriod,
  type VisionScope,
} from '../features/vision/period';

type ScopeIcons = Partial<Record<VisionScope, string | null>>;

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
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Single position in the pyramid: a zoom level + an anchor date.
  const [level, setLevel] = useState<VisionScope>('yearly');
  const [anchor, setAnchor] = useState<Date>(today);

  const periodKey = getPeriodKey(level, anchor);
  const locked = isFuturePeriod(level, periodKey);

  // The three period keys for the current anchor — one per row of the
  // layered navigator. Each row shows its own icon (persistently), so we
  // load all three at once whenever the anchor moves.
  const yearKey = getPeriodKey('yearly', anchor);
  const monthKey = getPeriodKey('monthly', anchor);
  const weekKey = getPeriodKey('weekly', anchor);

  const [icons, setIcons] = useState<ScopeIcons>({});
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchVisionIcons(userId, [yearKey, monthKey, weekKey])
      .then((rows) => {
        if (cancelled) return;
        const next: ScopeIcons = {};
        for (const r of rows) next[r.scope] = r.icon;
        setIcons(next);
      })
      .catch((err) => console.error('[vision] icons fetch failed', err));
    return () => {
      cancelled = true;
    };
  }, [userId, yearKey, monthKey, weekKey]);

  // Pick (or clear) the icon for the CURRENTLY ACTIVE level. Optimistic local
  // update so the row badge changes instantly; persists in the background.
  const pickIcon = useCallback(
    (icon: string | null) => {
      setIcons((prev) => ({ ...prev, [level]: icon }));
      if (!userId) return;
      void updateVisionEntryIcon(userId, level, periodKey, icon).catch((err) =>
        console.error('[vision] icon save failed', err),
      );
    },
    [userId, level, periodKey],
  );

  // Editor zoom direction: deeper level (year→month→week) = zoom IN, broader
  // = zoom OUT. Compared to the previous level; ref updates after commit.
  const prevLevelRef = useRef<VisionScope>(level);
  const zoomDir: 'in' | 'out' =
    SCOPE_DEPTH[level] >= SCOPE_DEPTH[prevLevelRef.current] ? 'in' : 'out';
  useEffect(() => {
    prevLevelRef.current = level;
  }, [level]);

  const { entry, loading, status, contentVersion, scheduleSave, setDocumentDate } =
    useVisionEntry(level, periodKey);

  // Default the DateBar to today when there's no entry yet.
  const todayIso = useMemo(() => toIsoDate(today), [today]);
  const documentDate = entry?.document_date ?? todayIso;

  // Activate a level at a given anchor — centre tap or side step.
  const pick = (targetLevel: VisionScope, targetAnchor: Date) => {
    setAnchor(targetAnchor);
    setLevel(targetLevel);
  };

  // "Jump to now" for the CURRENT level — lives in the editor's DateBar row.
  // Hidden when already on the current period.
  const isCurrentPeriod = periodKey === getPeriodKey(level, today);
  const jumpToNow = isCurrentPeriod
    ? null
    : {
        label:
          level === 'yearly'
            ? 'השנה'
            : level === 'monthly'
              ? 'החודש'
              : 'השבוע',
        onJump: () => setAnchor(today),
      };

  return (
    // -mt-3 tightens the gap with the global brand header.
    <section className="-mt-3 pb-3">
      <VisionLayers level={level} anchor={anchor} onPick={pick} icons={icons} />

      {/* Body — flat-top writing surface flush under the nav's divider. */}
      {locked ? (
        <LockedNotice level={level} />
      ) : loading ? (
        <div className="vision-page py-10">
          <CompassLoader size="md" />
        </div>
      ) : (
        <VisionEditor
          // resetKey re-mounts the editor when the period changes — and when
          // contentVersion bumps (external/live content replaced what's
          // shown), so cross-device edits become visible.
          resetKey={`${level}:${periodKey}:${contentVersion}`}
          scope={level}
          zoomDir={zoomDir}
          initialContent={entry?.content ?? null}
          placeholder={PLACEHOLDERS[level]}
          saveStatus={status}
          documentDate={documentDate}
          onDateChange={(iso) => void setDocumentDate(iso)}
          jumpToNow={jumpToNow}
          icon={icons[level] ?? null}
          onPickIcon={pickIcon}
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
