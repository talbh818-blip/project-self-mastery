// ============================================================================
// VisionEditor — Tiptap rich-text surface for a single vision entry.
// ----------------------------------------------------------------------------
// The editor is uncontrolled: it receives an initial document on mount (and
// again when the period key changes) and owns its state from there. Every
// keystroke fires `onChange(json)` so the parent can debounce + persist.
//
// LAYOUT:
//   • DateBar (top of card): title + period stepper, icon picker, Assist
//     toggle, save status.
//   • EditorContent: the writing surface.
//   • VisionToolbar (fixed, rides above the keyboard): size / bold / italic /
//     underline / list / highlight / undo-redo.
//
// ASSIST MODE: the DateBar toggle reveals a "+ כתיבה מודרכת" button under the
// title. Questions are inserted ONLY on tap — there is no auto-seeding (it
// used to re-seed every empty week as you navigated, which was unwanted).
// The question catalog is admin-managed (vision_questions table); we kick off
// its fetch on mount so picks are fresh by the time the user taps.
// ============================================================================
import { useEffect, useState } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import { EditorContent } from '@tiptap/react';
import type { SaveStatus } from './useVisionEntry';
import { useAssistMode } from './useAssistMode';
import { useKeyboardTracking } from './useKeyboardTracking';
import { VisionQuestionSettingsSheet } from './VisionQuestionSettingsSheet';
import { VisionToolbar } from './VisionToolbar';
import { VisionHabitsStrip } from './VisionHabitsStrip';
import { DateBar } from './DateBar';
import { CompassLoader } from '../../components/CompassLoader';
import { useAuth } from '../../hooks/useAuth';
import { ensureQuestionsLoaded } from './questions';
import {
  useVisionTiptapEditor,
  insertGuidedQuestion,
} from './useVisionTiptapEditor';
import type { VisionScope } from './period';

type Props = {
  /** Initial Tiptap JSON document. `null`/empty object → blank doc. */
  initialContent: unknown;
  /** Resets the editor when this changes (e.g. switching period). */
  resetKey: string;
  scope: VisionScope;
  placeholder?: string;
  readOnly?: boolean;
  saveStatus: SaveStatus;
  /** Direction of the scope-switch zoom: 'in' (finer) or 'out' (broader). */
  zoomDir: 'in' | 'out';
  /** The vision's display title (scope name + period range) for the DateBar. */
  title: string;
  /** Step the open period back / forward from the DateBar's chevrons. */
  onStepPeriod: (delta: number) => void;
  /** Whether the next period is reachable (not future). */
  canStepNext: boolean;
  /** "Back to current week" control, shown in the DateBar. Inactive when
   *  we're already on it. */
  jumpToNow: { label: string; enabled: boolean; onJump: () => void };
  /** Current level's icon (Lucide name or emoji char), shown on the DateBar
   *  picker button. null = none chosen yet. */
  icon: string | null;
  /** Open the icon picker for the current level. */
  onIconClick: () => void;
  onChange: (json: unknown) => void;
};

export function VisionEditor({
  initialContent,
  resetKey,
  scope,
  placeholder,
  readOnly,
  saveStatus,
  zoomDir,
  title,
  onStepPeriod,
  canStepNext,
  jumpToNow,
  icon,
  onIconClick,
  onChange,
}: Props) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Warm the guided-writing question catalog (DB-backed, falls back to the
  // built-in list until/unless the fetch lands). pickQuestion stays sync.
  useEffect(() => {
    void ensureQuestionsLoaded();
  }, []);
  // "My questions" settings sheet (gear next to the guided-writing button).
  const [questionSettingsOpen, setQuestionSettingsOpen] = useState(false);

  // The shared Tiptap engine (extensions, RTL, image paste/drop + upload). The
  // desktop editor uses the very same hook — only the surrounding chrome here
  // (bottom-fixed toolbar) differs.
  const { editor, uploadAndInsert, uploadingCount } = useVisionTiptapEditor({
    initialContent,
    resetKey,
    placeholder,
    readOnly,
    onChange,
  });

  // The open period's key, parsed out of resetKey (`${scope}:${periodKey}:${ver}`).
  // Feeds the per-habit summary strip in the header's second row, which shows
  // how each habit is doing for THIS exact period (week / month / year).
  const periodKey = resetKey.split(':')[1] ?? '';

  const { enabled: assistOn, toggle: toggleAssist } = useAssistMode();

  // Guided writing is opt-in via the DateBar's 🗺️ toggle, which slides open the
  // "+ כתיבה מודרכת" inserter below. Questions are added ONLY when the user taps
  // that button — never auto-seeded (auto-seeding re-filled every empty period
  // as you navigated, which was unwanted).

  if (!editor) {
    return (
      <div className="vision-editor vision-page">
        <DateBar
          title={title}
          onStepPeriod={onStepPeriod}
          canStepNext={canStepNext}
          jumpToNow={jumpToNow}
          assistOn={assistOn}
          onToggleAssist={toggleAssist}
          icon={icon}
          onIconClick={onIconClick}
          saveStatus={saveStatus}
        />
        <div className="py-8">
          <CompassLoader size="md" />
        </div>
      </div>
    );
  }

  // Key the card by scope so the zoom animation replays ONLY when the scope
  // changes (not on period changes). The toolbar is a SIBLING below — never
  // inside this transformed card — so the zoom can't disturb the fixed bar.
  const cardClass = `vision-editor vision-page vision-zoom-${zoomDir}`;

  const insertOneQuestion = () => insertGuidedQuestion(editor, scope);

  return (
    <>
      <div key={scope} className={cardClass}>
        <DateBar
          title={title}
          onStepPeriod={onStepPeriod}
          canStepNext={canStepNext}
          jumpToNow={jumpToNow}
          assistOn={assistOn}
          onToggleAssist={toggleAssist}
          icon={icon}
          onIconClick={onIconClick}
          saveStatus={saveStatus}
        />
        {/* Guided writing — revealed by the DateBar's 🗺️ toggle. The slide
            shell (grid-rows 0fr↔1fr) opens/closes it smoothly; "+ כתיבה
            מודרכת" inserts a fresh guiding question, the gear opens the
            personal-questions settings. */}
        {!readOnly && (
          <div
            className={`assist-reveal ${assistOn ? 'assist-reveal--open' : ''}`}
            aria-hidden={!assistOn}
          >
            <div className="assist-reveal__inner pb-2 flex items-stretch gap-1.5">
              <button
                type="button"
                tabIndex={assistOn ? 0 : -1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={insertOneQuestion}
                className="
                  flex-1 inline-flex items-center justify-center gap-1.5 h-9
                  rounded-xl border border-dashed border-surface-border
                  text-[13px] font-medium text-ink-300
                  hover:text-forest-400 hover:border-forest-600 hover:bg-forest-700/5
                  transition-colors
                "
              >
                <Plus size={15} strokeWidth={2.2} />
                כתיבה מודרכת
              </button>
              {/* My-questions settings — author personal questions and
                  optionally replace the defaults with them. */}
              <button
                type="button"
                tabIndex={assistOn ? 0 : -1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setQuestionSettingsOpen(true)}
                aria-label="השאלות שלי"
                title="השאלות שלי"
                className="
                  shrink-0 w-9 h-9 inline-flex items-center justify-center
                  rounded-xl border border-dashed border-surface-border
                  text-ink-300
                  hover:text-forest-400 hover:border-forest-600 hover:bg-forest-700/5
                  transition-colors
                "
              >
                <Settings2 size={15} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}
        <EditorContent editor={editor} />
        {/* Per-habit success rings for the open period (week / month / year),
            at the BOTTOM of the vision — below the writing. Self-hides when the
            user has no habits; carries its own divider above. */}
        <VisionHabitsStrip userId={userId} scope={scope} periodKey={periodKey} />
      </div>
      {/* Scroll runway: extra space below the card so the last lines of a long
          vision scroll clear of the fixed formatting toolbar (which would
          otherwise cover them at the bottom of the page). Only when the
          toolbar is present (editable). */}
      {!readOnly && <div aria-hidden className="vision-editor-runway" />}
      {!readOnly && (
        <ToolbarShell>
          <VisionToolbar
            editor={editor}
            onPickImage={uploadAndInsert}
            uploadingCount={uploadingCount}
            canUpload={!!userId}
          />
        </ToolbarShell>
      )}
      <VisionQuestionSettingsSheet
        open={questionSettingsOpen}
        initialScope={scope}
        onClose={() => setQuestionSettingsOpen(false)}
      />
    </>
  );
}

/**
 * Wraps the fixed-bottom toolbar. `useKeyboardTracking` writes the live
 * keyboard height into the `--vision-kb` CSS var; `.vision-toolbar-fixed`
 * reads it to glue the toolbar to whichever is higher — the bottom-nav
 * dock or the top of the on-screen keyboard. No React state in the hot
 * path, so the follow is smooth.
 */
function ToolbarShell({ children }: { children: React.ReactNode }) {
  useKeyboardTracking();
  return (
    <div className="vision-toolbar-fixed">
      <div className="max-w-md mx-auto px-3">{children}</div>
    </div>
  );
}
