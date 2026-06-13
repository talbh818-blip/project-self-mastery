// ============================================================================
// useVisionController — the shared "brain" behind BOTH vision layouts.
// ----------------------------------------------------------------------------
// The MOBILE (VisionMobile) and DESKTOP (VisionDesktop) layouts are deliberately
// two separate presentational shells that can evolve independently. But the
// part that must NEVER diverge — which vision is open, loading/saving it,
// per-period icons, version history, the zoom direction — lives here, once.
//
// This hook owns the single position in the year→month→week pyramid (a `level`
// + an `anchor` Date) plus the entry's persistence (via useVisionEntry). It
// exposes PRIMITIVES (setLevel/setAnchor) and pure derivations (periodKey,
// locked, visionTitle, canStepNext, zoomDir, periodReady). Each layout composes
// its OWN navigation handlers + its own navigator chrome (year map / sidebar /
// feed) on top of these — that's where the two surfaces differ.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useVisionEntry } from './useVisionEntry';
import { fetchVisionRowMeta } from './queries';
import { updateVisionEntryIcon } from './mutations';
import {
  addAnchor,
  getPeriodKey,
  getWeekKey,
  isFuturePeriod,
  monthShort,
  parsePeriodStart,
  type VisionScope,
} from './period';

export type ScopeIcons = Partial<Record<VisionScope, string | null>>;

// Nesting depth — drives the editor's zoom direction on level switches.
const SCOPE_DEPTH: Record<VisionScope, number> = {
  yearly: 0,
  monthly: 1,
  weekly: 2,
};

export const VISION_PLACEHOLDERS: Record<VisionScope, string> = {
  yearly: 'מה החזון שלך לשנה הזו? מה הכי חשוב לך להשיג?',
  monthly: 'איך אתה רוצה שהחודש הזה ייראה?',
  weekly: 'מה המיקוד שלך לשבוע הזה?',
};

/** The vision's display title: scope name + a compact period range, e.g.
 *  "חזון שבועי · 7.6", "חזון חודשי · יוני 26", "חזון שנתי · 2026". */
export function formatVisionTitle(level: VisionScope, anchor: Date): string {
  if (level === 'yearly') return `חזון שנתי · ${anchor.getFullYear()}`;
  if (level === 'monthly') {
    const yy = String(anchor.getFullYear()).slice(-2);
    return `חזון חודשי · ${monthShort(anchor.getMonth())} ${yy}`;
  }
  // weekly — short: just the Sunday that opens the week (day.month).
  const start = parsePeriodStart('weekly', getWeekKey(anchor));
  return `חזון שבועי · ${start.getDate()}.${start.getMonth() + 1}`;
}

export type VisionController = ReturnType<typeof useVisionController>;

export function useVisionController() {
  const today = useMemo(() => new Date(), []);
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Single position in the pyramid: a zoom level + an anchor date. Fresh
  // loads land on the CURRENT WEEK — the most actionable horizon.
  const [level, setLevel] = useState<VisionScope>('weekly');
  const [anchor, setAnchor] = useState<Date>(today);

  const periodKey = getPeriodKey(level, anchor);
  const locked = isFuturePeriod(level, periodKey);

  // The three period keys for the current anchor — one per row of a layered
  // navigator. Each shows its own icon (persistently), so we load all three at
  // once whenever the anchor moves.
  const yearKey = getPeriodKey('yearly', anchor);
  const monthKey = getPeriodKey('monthly', anchor);
  const weekKey = getPeriodKey('weekly', anchor);

  const [icons, setIcons] = useState<ScopeIcons>({});

  // In-memory cache of each period's icon, keyed by `${scope}:${periodKey}`.
  // We seed instantly from the cache and only round-trip for periods we
  // haven't seen yet, so the active level's icon never trails the labels.
  const metaCacheRef = useRef<Map<string, string | null>>(new Map());

  useEffect(() => {
    if (!userId) return;
    const pairs: [VisionScope, string][] = [
      ['yearly', yearKey],
      ['monthly', monthKey],
      ['weekly', weekKey],
    ];

    // 1. Seed icons from cache so revisited periods render with no lag.
    const seedIcons: ScopeIcons = {};
    let allCached = true;
    for (const [scope, key] of pairs) {
      const cacheKey = `${scope}:${key}`;
      if (metaCacheRef.current.has(cacheKey)) {
        seedIcons[scope] = metaCacheRef.current.get(cacheKey) ?? null;
      } else {
        allCached = false;
      }
    }
    setIcons(seedIcons);
    if (allCached) return; // fully served from cache — skip the round-trip

    // 2. Refresh from the DB, then cache every requested key (including the
    //    ones with no row, cached as null, so they don't re-fetch later).
    let cancelled = false;
    fetchVisionRowMeta(userId, [yearKey, monthKey, weekKey])
      .then((rows) => {
        if (cancelled) return;
        const nextIcons: ScopeIcons = {};
        for (const [scope] of pairs) nextIcons[scope] = null;
        for (const r of rows) nextIcons[r.scope] = r.icon;
        for (const [scope, key] of pairs) {
          metaCacheRef.current.set(`${scope}:${key}`, nextIcons[scope] ?? null);
        }
        setIcons(nextIcons);
      })
      .catch((err) => console.error('[vision] row-meta fetch failed', err));
    return () => {
      cancelled = true;
    };
  }, [userId, yearKey, monthKey, weekKey]);

  // Which level's icon picker is open (null = closed).
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
      metaCacheRef.current.set(`${lvl}:${key}`, icon);
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

  const { entry, loading, status, contentVersion, scheduleSave, restore } =
    useVisionEntry(level, periodKey);

  // Version-history (restore) sheet — shared between layouts.
  const [historyOpen, setHistoryOpen] = useState(false);

  // Persist edits (debounced inside useVisionEntry).
  const handleEditorChange = useCallback(
    (json: unknown) => scheduleSave(json),
    [scheduleSave],
  );

  const visionTitle = formatVisionTitle(level, anchor);
  const canStepNext = !isFuturePeriod(
    level,
    getPeriodKey(level, addAnchor(level, anchor, 1)),
  );

  // Open a period in the editor: set both the level and the anchor at once.
  const goToPeriod = useCallback((targetLevel: VisionScope, targetAnchor: Date) => {
    setAnchor(targetAnchor);
    setLevel(targetLevel);
  }, []);

  // CRITICAL: only treat the entry as ready to render once it actually belongs
  // to the CURRENT (level, periodKey). When jumping periods, `entry` lags one
  // render behind useVisionEntry's effect, so for a frame it still holds the
  // PREVIOUS period's content — mounting then would show (and could save) the
  // old text under the new key. Guard against it.
  const periodReady =
    entry === null ||
    (entry.scope === level && entry.period_key === periodKey);

  return {
    today,
    userId,
    // position
    level,
    setLevel,
    anchor,
    setAnchor,
    goToPeriod,
    periodKey,
    locked,
    yearKey,
    monthKey,
    weekKey,
    // entry + persistence
    entry,
    loading,
    status,
    contentVersion,
    scheduleSave,
    restore,
    handleEditorChange,
    periodReady,
    // icons
    icons,
    iconPickerLevel,
    setIconPickerLevel,
    applyIcon,
    // history
    historyOpen,
    setHistoryOpen,
    // derivations
    zoomDir,
    visionTitle,
    canStepNext,
  };
}
