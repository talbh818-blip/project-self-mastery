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
import { useEffect, useState } from 'react';
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
      // The per-period habit rings move up into the header's LEFT cluster
      // (where back-to-now used to be) instead of sitting at the bottom.
      leftSlot={
        <VisionHabitsStrip
          userId={userId}
          scope={scope}
          periodKey={periodKey}
          variant="inline"
        />
      }
    />
  );

  if (!editor) {
    return (
      <div className="vision-editor vision-page-desktop">
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
          change (not period changes). */}
      <div key={scope} className={`vision-editor vision-page-desktop vision-zoom-${zoomDir}`}>
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
                  hover:text-forest-400 hover:border-forest-600 hover:bg-forest-700/5
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
                  hover:text-forest-400 hover:border-forest-600 hover:bg-forest-700/5
                  transition-colors
                "
              >
                <Settings2 size={20} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}

        {/* The habit rings live in the header (leftSlot) on desktop, not at the
            bottom — so nothing here below the writing. */}
        <EditorContent editor={editor} />
      </div>

      <VisionQuestionSettingsSheet
        open={questionSettingsOpen}
        initialScope={scope}
        onClose={() => setQuestionSettingsOpen(false)}
      />
    </div>
  );
}
