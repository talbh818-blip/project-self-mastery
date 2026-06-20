// ============================================================================
// Reminder sounds — a tiny WebAudio synth that plays the chime the user picked
// for a reminder. Asset-free (oscillator tones), so there are no audio files to
// host and it works offline.
//
// Where it plays: the FOREGROUND scheduler and the "שלח בדיקה" preview (the app
// is open, so the page can make sound), plus an instant preview when the user
// taps a sound chip in the editor. A CLOSED-app push can't pick a custom sound —
// the OS notification channel decides that — so this is a foreground nicety.
// ============================================================================

export type ReminderSoundKey = 'chime' | 'bell' | 'ding' | 'soft' | 'none';

/** The catalog shown as chips in the editor (order = display order). */
export const REMINDER_SOUNDS: Array<{ key: ReminderSoundKey; label: string }> = [
  { key: 'chime', label: 'פעמון רך' },
  { key: 'bell', label: 'פעמון' },
  { key: 'ding', label: 'דינג' },
  { key: 'soft', label: 'עדין' },
  { key: 'none', label: 'ללא' },
];

export const DEFAULT_REMINDER_SOUND: ReminderSoundKey = 'chime';

// One shared AudioContext, created lazily on first play (a user gesture, so
// browsers allow it). Resumed if the browser parked it.
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

type Note = {
  freq: number;
  /** Offset from the start of the sound, in seconds. */
  start: number;
  /** How long the note rings, in seconds. */
  dur: number;
  gain?: number;
  type?: OscillatorType;
};

function playNotes(notes: Note[]): void {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.freq;
    const t0 = now + n.start;
    const peak = n.gain ?? 0.18;
    // A soft pluck: quick attack, exponential decay to (near) silence.
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + n.dur + 0.02);
  }
}

/** Play the chime for a reminder. 'none' (or an unknown key → default) is safe. */
export function playReminderSound(key: string | null | undefined): void {
  switch (key) {
    case 'none':
      return;
    case 'bell':
      playNotes([
        { freq: 880, start: 0, dur: 0.7, type: 'triangle', gain: 0.2 },
        { freq: 1318.5, start: 0, dur: 0.8, type: 'sine', gain: 0.08 },
      ]);
      return;
    case 'ding':
      playNotes([
        { freq: 1568, start: 0, dur: 0.25, type: 'sine', gain: 0.2 },
        { freq: 2093, start: 0.08, dur: 0.3, type: 'sine', gain: 0.12 },
      ]);
      return;
    case 'soft':
      playNotes([
        { freq: 523.25, start: 0, dur: 0.55, type: 'sine', gain: 0.16 },
        { freq: 659.25, start: 0.12, dur: 0.55, type: 'sine', gain: 0.14 },
      ]);
      return;
    case 'chime':
    default:
      playNotes([
        { freq: 659.25, start: 0, dur: 0.4, type: 'sine', gain: 0.18 },
        { freq: 987.77, start: 0.13, dur: 0.5, type: 'sine', gain: 0.16 },
        { freq: 1318.5, start: 0.26, dur: 0.6, type: 'sine', gain: 0.12 },
      ]);
      return;
  }
}
