// ============================================================================
// VisionEditorDesktop — the wide, Google-Docs-style writing surface.
// ----------------------------------------------------------------------------
// Same editor ENGINE as the mobile VisionEditor (shared via useVisionTiptapEditor
// — identical extensions, RTL, image paste/drop), but a desktop CHROME:
//   • the formatting toolbar sits STICKY AT THE TOP (not bottom-fixed) — there
//     is no on-screen keyboard to ride on a desktop;
//   • the writing column is WIDE and centred, with roomy notebook padding;
//   • the DateBar (title + period stepper + icon + assist + save) sits at the
//     top of the document card.
//
// This is one of the two independent Vision layouts; it shares only the engine
// + the controller with the mobile one.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import { EditorContent } from '@tiptap/react';
import type { SaveStatus } from './useVisionEntry';
import { useAssistMode } from './useAssistMode';
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

// Card content-box width (px) at/above which the habit rings ride in the header
// flush-left; below it they move to a full-width row under the writing (mobile
// style). Tuned so five rings + the title + side buttons fit before cutting over.
const RINGS_HEADER_MIN_WIDTH = 680;

type Props = {
  initialContent: unknown;
  resetKey: string;
  scope: VisionScope;
  placeholder?: string;
  readOnly?: boolean;
  saveStatus: SaveStatus;
  zoomDir: 'in' | 'out';
  title: string;
  onStepPeriod: (delta: number) => void;
  canStepNext: boolean;
  jumpToNow: { label: string; enabled: boolean; onJump: () => void };
  icon: string | null;
  onIconClick: () => void;
  onChange: (json: unknown) => void;
};

export function VisionEditorDesktop({
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

  useEffect(() => {
    void ensureQuestionsLoaded();
  }, []);
  const [questionSettingsOpen, setQuestionSettingsOpen] = useState(false);

  // Responsive habit-ring placement. The desktop editor is the centre column,
  // so its width shrinks as the window narrows / the navigator rail opens. When
  // the card is wide enough the rings sit in the header (flush-left); when it's
  // too narrow they drop to a full-width row UNDER the writing — exactly like
  // mobile — instead of crowding the title. We measure the card itself (not the
  // viewport) so it's accurate regardless of the rail. Threshold = card
  // content-box width; tune RINGS_HEADER_MIN_WIDTH if the cutover feels off.
  const [ringsInHeader, setRingsInHeader] = useState(true);
  const roRef = useRef<ResizeObserver | null>(null);
  const measureCard = useCallback((node: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    if (!node || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setRingsInHeader(w >= RINGS_HEADER_MIN_WIDTH);
    });
    ro.observe(node);
    roRef.current = ro;
  }, []);
  useEffect(() => () => roRef.current?.disconnect(), []);

  const { editor, uploadAndInsert, uploadingCount } = useVisionTiptapEditor({
    initialContent,
    resetKey,
    placeholder,
    readOnly,
    onChange,
  });

  const { enabled: assistOn, toggle: toggleAssist } = useAssistMode();

  const periodKey = resetKey.split(':')[1] ?? '';

  // While the editor is being (re)created, keep the document card structure so
  // the layout doesn't jump — just show the loader inside it.
  const docHeader = (
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
      variant="desktop"
      // When the card is wide enough, the rings ride flush-LEFT in the header
      // (and back-to-now moves to the right cluster). When it's too narrow the
      // header has NO rings — DateBar then puts back-to-now back on the LEFT,
      // and the rings render under the writing instead (see below).
      leftSlot={
        ringsInHeader && scope !== 'daily' ? (
          <VisionHabitsStrip
            userId={userId}
            scope={scope}
            periodKey={periodKey}
            variant="inline"
          />
        ) : undefined
      }
    />
  );

  if (!editor) {
    return (
      <div ref={measureCard} className="vision-editor vision-page-desktop">
        {docHeader}
        <div className="py-10">
          <CompassLoader size="md" />
        </div>
      </div>
    );
  }

  const insertOneQuestion = () => insertGuidedQuestion(editor, scope);

  return (
    <div className="vision-desktop-doc">
      {/* Top toolbar — sticky, Google-Docs style. A SIBLING above the document
          card so the card's zoom animation can't disturb it. */}
      {!readOnly && (
        <div className="vision-desktop-toolbar">
          <VisionToolbar
            editor={editor}
            onPickImage={uploadAndInsert}
            uploadingCount={uploadingCount}
            canUpload={!!userId}
            fitWidth={false}
            popoverPlacement="down"
          />
        </div>
      )}

      {/* The document card. Keyed by scope so the zoom replays only on a scope
          change (not period changes). Measured (measureCard) to decide whether
          the habit rings fit in the header or drop below the writing. */}
      <div
        key={scope}
        ref={measureCard}
        className={`vision-editor vision-page-desktop vision-desktop-card vision-zoom-${zoomDir}`}
      >
        {docHeader}

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
                  flex-1 inline-flex items-center justify-center gap-1.5 h-10
                  rounded-xl border border-dashed border-surface-border
                  text-sm font-medium text-ink-300
                  hover:text-forest-700 hover:border-forest-600 hover:bg-forest-700/5
                  transition-colors
                "
              >
                <Plus size={20} strokeWidth={2.2} />
                כתיבה מודרכת
              </button>
              <button
                type="button"
                tabIndex={assistOn ? 0 : -1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setQuestionSettingsOpen(true)}
                aria-label="השאלות שלי"
                title="השאלות שלי"
                className="
                  shrink-0 w-10 h-10 inline-flex items-center justify-center
                  rounded-xl border border-dashed border-surface-border
                  text-ink-300
                  hover:text-forest-700 hover:border-forest-600 hover:bg-forest-700/5
                  transition-colors
                "
              >
                <Settings2 size={20} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}

        <EditorContent editor={editor} className="vision-desktop-write" />

        {/* When the card is too narrow for the rings in the header, they live
            here — a full-width row under the writing, exactly like mobile.
            Never on a daily journaling entry (a day is "separate from the
            vision"). */}
        {!ringsInHeader && scope !== 'daily' && (
          <VisionHabitsStrip
            userId={userId}
            scope={scope}
            periodKey={periodKey}
            variant="bottom"
          />
        )}
      </div>

      <VisionQuestionSettingsSheet
        open={questionSettingsOpen}
        initialScope={scope}
        onClose={() => setQuestionSettingsOpen(false)}
      />
    </div>
  );
}
