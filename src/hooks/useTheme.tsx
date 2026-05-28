import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { Theme } from '../features/admin/types';
import { useCurrentProfile } from '../features/admin/ProfileContext';

type Ctx = {
  theme: Theme;
};

const ThemeContext = createContext<Ctx | undefined>(undefined);

const STORAGE_KEY = 'app-theme';

function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    // ignore
  }
  return 'dark';
}

// Applies the theme to <html data-theme="..."> the moment the profile loads,
// and falls back to a localStorage copy so the previous choice is visible
// before the profile round-trip completes.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { profile } = useCurrentProfile();
  const theme: Theme = profile?.theme ?? readStoredTheme();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  return <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
