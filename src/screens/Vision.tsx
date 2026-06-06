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
import { VisionViewBar, type VisionView } from '../features/vision/VisionViewBar';
import { VisionIconPicker } from '../features/vision/VisionIconPicker';
import { useVisionEntry } from '../features/vision/useVisionEntry';
import { fetchVisionRowMeta } from '../features/vision/queries';
import { updateVisionEntryIcon } from '../features/vision/mutations';
import { isVisionContentEmpty } from '../features/vision/content';
import { useAuth } from '../hooks/useAuth';
import { CompassLoader } from '../components/CompassLoader';
import {
  getPeriodKey,
  isFuturePeriod,
  type VisionScope,
} from '../features/vision/period';

type ScopeIcons = Partial<Record<VisionScope, string | null>>;
type ScopeFlags = Partial<Record<VisionScope, boolean>>;

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

  // Top-bar state: whether the 3-layer navigator drawer is expanded, and
  // which view is active. 'board' is a placeholder until its spec lands.
  const [layersOpen, setLayersOpen] = useState(true);
  const [view, setView] = useState<VisionView>('layers');

  const periodKey = getPeriodKey(level, anchor);
  const locked = isFuturePeriod(level, periodKey);

  // The three period keys for the current anchor — one per row of the
  // layered navigator. Each row shows its own icon (persistently), so we
  // load all three at once whenever the anchor moves.
  const yearKey = getPeriodKey('yearly', anchor);
  const monthKey = getPeriodKey('monthly', anchor);
  const weekKey = getPeriodKey('weekly', anchor);

  const [icons, setIcons] = useState<ScopeIcons>({});
  // Which rows already have written content → drives the "written" check-mark.
  const [written, setWritten] = useState<ScopeFlags>({});

  // In-memory cache of row-meta keyed by `${scope}:${periodKey}`. Navigation
  // used to re-hit the DB on every step, so the icons + "written" dots
  // visibly trailed the (synchronous) period labels. We now seed instantly
  // from the cache and only round-trip for periods we haven't seen yet — so
  // stepping back and forth feels smooth.
  const metaCacheRef = useRef<
    Map<string, { icon: string | null; written: boolean }>
  >(new Map());

  useEffect(() => {
    if (!userId) return;
    const pairs: [VisionScope, string][] = [
      ['yearly', yearKey],
      ['monthly', monthKey],
      ['weekly', weekKey],
    ];

    // 1. Seed from cache so revisited periods render with no lag and no flash
    //    of the previous period's icons.
    const seedIcons: ScopeIcons = {};
    const seedWritten: ScopeFlags = {};
    let allCached = true;
    for (const [scope, key] of pairs) {
      const hit = metaCacheRef.current.get(`${scope}:${key}`);
      if (hit) {
        seedIcons[scope] = hit.icon;
        seedWritten[scope] = hit.written;
      } else {
        allCached = false;
      }
    }
    setIcons(seedIcons);
    setWritten(seedWritten);
    if (allCached) return; // fully served from cache — skip the round-trip

    // 2. Refresh from the DB, then cache every requested key (including the
    //    ones with no row, cached as empty, so they don't re-fetch later).
    let cancelled = false;
    fetchVisionRowMeta(userId, [yearKey, monthKey, weekKey])
      .then((rows) => {
        if (cancelled) return;
        const nextIcons: ScopeIcons = {};
        const nextWritten: ScopeFlags = {};
        for (const [scope] of pairs) {
          nextIcons[scope] = null;
          nextWritten[scope] = false;
        }
        for (const r of rows) {
          nextIcons[r.scope] = r.icon;
          nextWritten[r.scope] = !isVisionContentEmpty(r.content);
        }
        for (const [scope, key] of pairs) {
          metaCacheRef.current.set(`${scope}:${key}`, {
            icon: nextIcons[scope] ?? null,
            written: nextWritten[scope] ?? false,
          });
        }
        setIcons(nextIcons);
        setWritten(nextWritten);
      })
      .catch((err) => console.error('[vision] row-meta fetch failed', err));
    return () => {
      cancelled = true;
    };
  }, [userId, yearKey, monthKey, weekKey]);

  // Which level's icon picker is open (null = closed). Opened by tapping a
  // row's icon tile in VisionLayers — so any level's icon can be set, not
  // just the active one.
  const [iconPickerLevel, setIconPickerLevel] = useState<VisionScope | null>(
    null,
  );
  // Apply the picked icon to the level whose tile was tapped. Optimistic
  // local update so the tile changes instantly; persists in the background.
  const applyIcon = useCallback(
    (icon: string | null) => {
      const lvl = iconPickerLevel;
      if (!lvl) return;
      const key = getPeriodKey(lvl, anchor);
      setIcons((prev) => ({ ...prev, [lvl]: icon }));
      // Keep the cache in sync so leaving and returning shows the new icon.
      const prevMeta = metaCacheRef.current.get(`${lvl}:${key}`);
      metaCacheRef.current.set(`${lvl}:${key}`, {
        icon,
        written: prevMeta?.written ?? false,
      });
      if (!userId) return;
      void updateVisionEntryIcon(userId, lvl, key, icon).catch((err) =>
        console.error('[vision] icon save failed', err),
      );
    },
    [iconPickerLevel, userId, anchor],
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

  // Live-track whether the ACTIVE entry has content as the user types, so the
  // check-mark appears/disappears instantly (not only after the debounced
  // save). Wraps scheduleSave — declared AFTER useVisionEntry so scheduleSave
  // is in scope.
  const handleEditorChange = useCallback(
    (json: unknown) => {
      const empty = isVisionContentEmpty(json);
      setWritten((prev) =>
        prev[level] === !empty ? prev : { ...prev, [level]: !empty },
      );
      // Mirror the live "written" state into the cache for this period.
      const prevMeta = metaCacheRef.current.get(`${level}:${periodKey}`);
      metaCacheRef.current.set(`${level}:${periodKey}`, {
        icon: prevMeta?.icon ?? null,
        written: !empty,
      });
      scheduleSave(json);
    },
    [level, periodKey, scheduleSave],
  );

  // Default the DateBar to today when there's no entry yet.
  const todayIso = useMemo(() => toIsoDate(today), [today]);
  const documentDate = entry?.document_date ?? todayIso;

  // Activate a level at a given anchor — centre tap or side step.
  const pick = (targetLevel: VisionScope, targetAnchor: Date) => {
    setAnchor(targetAnchor);
    setLevel(targetLevel);
  };

  // "Jump to now" for the CURRENT level — always shown in the top bar, but
  // INACTIVE when we're already on the current period (nothing to jump to).
  const isCurrentPeriod = periodKey === getPeriodKey(level, today);
  const jumpToNow = {
    label:
      level === 'yearly'
        ? 'השנה'
        : level === 'monthly'
          ? 'החודש'
          : 'השבוע',
    enabled: !isCurrentPeriod,
    onJump: () => setAnchor(today),
  };

  return (
    // -mt-3 tightens the gap with the global brand header.
    <section className="-mt-3 pb-3">
      <VisionViewBar
        layersOpen={layersOpen}
        onToggleLayers={() => setLayersOpen((v) => !v)}
        jumpToNow={jumpToNow}
        view={view}
        onViewChange={setView}
      />

      {/* Layered navigator — collapses as a drawer. The grid 0fr↔1fr trick
          animates real content height with no JS measuring; the inner wrapper
          clips during the fold. */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: layersOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden min-h-0">
          <VisionLayers
            level={level}
            anchor={anchor}
            onPick={pick}
            icons={icons}
            written={written}
          />
        </div>
      </div>

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
          icon={icons[level] ?? null}
          onIconClick={() => setIconPickerLevel(level)}
          onChange={handleEditorChange}
        />
      )}

      {/* Icon picker — opened from the DateBar's icon button (current level). */}
      <VisionIconPicker
        open={iconPickerLevel !== null}
        value={iconPickerLevel ? icons[iconPickerLevel] ?? null : null}
        onPick={applyIcon}
        onClose={() => setIconPickerLevel(null)}
      />
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
