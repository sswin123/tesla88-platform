'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type DesignPreset =
  | 'midnight'
  | 'ocean'
  | 'graphite'
  | 'neon'
  | 'emerald'
  | 'clean'
  | 'cloud'
  | 'tesla88';

const STORAGE_KEY = 'erp-design-preset';
const DEFAULT_PRESET: DesignPreset = 'tesla88';

interface AppearanceContextValue {
  design: DesignPreset;
  setDesign: (preset: DesignPreset) => void;
}

const AppearanceContext = createContext<AppearanceContextValue>({
  design: DEFAULT_PRESET,
  setDesign: () => {},
});

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [design, setDesignState] = useState<DesignPreset>(DEFAULT_PRESET);

  // Read from localStorage on mount (client only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as DesignPreset | null;
      if (saved && isValidPreset(saved)) {
        setDesignState(saved);
        document.documentElement.setAttribute('data-design', saved);
      } else {
        document.documentElement.setAttribute('data-design', DEFAULT_PRESET);
      }
    } catch {
      document.documentElement.setAttribute('data-design', DEFAULT_PRESET);
    }
  }, []);

  const setDesign = (preset: DesignPreset) => {
    setDesignState(preset);
    try {
      localStorage.setItem(STORAGE_KEY, preset);
    } catch {
      // ignore storage errors
    }
    document.documentElement.setAttribute('data-design', preset);
  };

  return (
    <AppearanceContext.Provider value={{ design, setDesign }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}

function isValidPreset(value: string): value is DesignPreset {
  return [
    'midnight', 'ocean', 'graphite', 'neon',
    'emerald', 'clean', 'cloud', 'tesla88',
  ].includes(value);
}
