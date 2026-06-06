// ============================================================================
// ErrorBoundary — contains render crashes so one throw doesn't blank the app.
// ----------------------------------------------------------------------------
// Without a boundary, any error thrown during render unmounts the whole React
// tree → a black screen. This boundary catches it, SELF-HEALS transient
// crashes by retrying after a short delay (e.g. the Tiptap editor's
// destroy/recreate race during fast navigation), and falls back to a small
// recoverable notice if the error persists.
//
// `resetKeys` clears the error whenever they change — pass the navigation
// position so moving to another period always gets a fresh attempt.
// ============================================================================
import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Shown while a transient error is being retried (defaults to nothing). */
  pendingFallback?: ReactNode;
  /** Shown when retries are exhausted. Receives a `retry` to reset manually. */
  fallback?: (retry: () => void, error: Error) => ReactNode;
  /** Clearing the error when any of these change (e.g. the period key). */
  resetKeys?: readonly unknown[];
  /** Silent auto-retry delay (ms) and how many times before giving up. */
  autoRetryMs?: number;
  maxRetries?: number;
};

type State = { error: Error | null; retries: number };

function keysChanged(a?: readonly unknown[], b?: readonly unknown[]): boolean {
  if (a === b) return false;
  if (!a || !b || a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return true;
  return false;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retries: 0 };
  private timer: number | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary] caught render error:', error);
    const { autoRetryMs = 80, maxRetries = 2 } = this.props;
    if (this.state.retries < maxRetries) {
      this.clearTimer();
      this.timer = window.setTimeout(() => {
        this.setState((s) => ({ error: null, retries: s.retries + 1 }));
      }, autoRetryMs);
    }
  }

  componentDidUpdate(prev: Props) {
    // A navigation (resetKeys change) is a clean slate — drop the error and
    // the retry counter so the next period starts fresh.
    if (
      (this.state.error || this.state.retries > 0) &&
      keysChanged(prev.resetKeys, this.props.resetKeys)
    ) {
      this.clearTimer();
      this.setState({ error: null, retries: 0 });
    }
  }

  componentWillUnmount() {
    this.clearTimer();
  }

  private clearTimer() {
    if (this.timer != null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private retry = () => {
    this.clearTimer();
    this.setState({ error: null, retries: 0 });
  };

  render() {
    const { error, retries } = this.state;
    if (error) {
      const { maxRetries = 2, fallback, pendingFallback } = this.props;
      // Still within the auto-retry budget → show the pending fallback while
      // the timer schedules another attempt.
      if (retries < maxRetries) return pendingFallback ?? null;
      // Exhausted → recoverable notice.
      return fallback ? fallback(this.retry, error) : null;
    }
    return this.props.children;
  }
}
