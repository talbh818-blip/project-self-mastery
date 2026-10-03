// ============================================================================
// VisionEditorDesktop — the wide, Google-Docs-style writing surface.
// ----------------------------------------------------------------------------
// Same editor ENGINE as the mobile VisionEditor (shared via useVisionTiptapEditor
// — identical extensions, RTL, image paste/drop), but a desktop CHROME:
//   • the formatting toolbar sits STICKY AT THE BOTTOM of the writing column,
//     below both the weekly writing and the daily strip, and follows focus so
//     it drives whichever surface is active;
//   • the writing column is WIDE and centred, with roomy notebook padding;
//   • the DateBar (title + period stepper + icon + assist + save) sits at the
//     top of the document card.
//
// This is one of the two independent Vision layouts; it shares only the engine
// + the controller with the mobile one.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import { EditorContent } from '@tiptap/react';
import type { SaveStatus } from './useVisionEntry';
import { useAssistMode } from './useAssistMode';
import { VisionQuestionSettingsSheet } from './VisionQuestionSettingsSheet';
import { VisionToolbar } from './VisionToolbar';
import { VisionDailyStrip, type DailyToolbarTarget } from './VisionDailyStrip';
import { useJournalingEnabled } from './journalingFeature';
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
  const journalingOn = useJournalingEnabled();

  useEffect(() => {
    void ensureQuestionsLoaded();
  }, []);
  const [questionSettingsOpen, setQuestionSettingsOpen] = useState(false);

  // The ONE top toolbar follows focus: while a daily surface (if any) is
  // focused it drives THAT editor; otherwise it drives the weekly editor.
  const [dailyTarget, setDailyTarget] = useState<DailyToolbarTarget | null>(null);
  const [dailyFocused, setDailyFocused] = useState(false);
  const handleDailyFocus = useCallback(() => setDailyFocused(true), []);

  const { editor, uploadAndInsert, uploadingCount } = useVisionTiptapEditor({
    initialContent,
    resetKey,
    placeholder,
    readOnly,
    onChange,
  });

  // When the weekly editor regains focus (or re-mounts on a period/scope
  // change), the top toolbar goes back to driving it.
  useEffect(() => {
    setDailyFocused(false);
    if (!editor) return;
    const onWeeklyFocus = () => setDailyFocused(false);
    editor.on('focus', onWeeklyFocus);
    return () => {
      editor.off('focus', onWeeklyFocus);
    };
  }, [editor]);

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

  // The top toolbar drives whichever editor is focused — the daily surface when
  // it's active, the weekly one otherwise.
  const toolbarTarget: DailyToolbarTarget =
    dailyFocused && dailyTarget
      ? dailyTarget
      : { editor, uploadAndInsert, uploadingCount };

  return (
    <div className="vision-desktop-doc">
      {/* The document card. Keyed by scope so the zoom replays only on a scope
          change (not period changes). */}
      <div
        key={scope}
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
      </div>

      {/* Daily-journaling card — its OWN page card BELOW the weekly one, a hair
          darker so the two read apart. Being a separate block (not inside the
          weekly card) is what lets it grow DOWNWARD and scroll the page instead
          of stealing height from the weekly writing. Weekly vision + Journaling
          only. Same page padding → the writing lines up with the weekly above. */}
      {!readOnly && scope === 'weekly' && journalingOn && (
        <div className="vision-editor vision-page-desktop vision-daily-card">
          <VisionDailyStrip
            userId={userId}
            weekKey={periodKey}
            onDailyRegister={setDailyTarget}
            onDailyFocus={handleDailyFocus}
          />
        </div>
      )}

      {/* Formatting toolbar — sticky at the BOTTOM of the writing column, below
          both the weekly writing and the daily strip. It follows focus: it
          formats the daily surface while that's active, the weekly one
          otherwise (popovers open upward). */}
      {!readOnly && (
        <div className="vision-desktop-toolbar">
          <VisionToolbar
            editor={toolbarTarget.editor}
            onPickImage={toolbarTarget.uploadAndInsert}
            uploadingCount={toolbarTarget.uploadingCount}
            canUpload={!!userId}
            fitWidth={false}
            popoverPlacement="up"
          />
        </div>
      )}

      <VisionQuestionSettingsSheet
        open={questionSettingsOpen}
        initialScope={scope}
        onClose={() => setQuestionSettingsOpen(false)}
      />
    </div>
  );
}
