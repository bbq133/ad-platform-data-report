import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'adintel-ui-mode';
/** default: 夜晚模式 | bright-minimal: 日光模式（明亮简洁） */
export type UiMode = 'default' | 'bright-minimal';

function readStoredMode(): UiMode {
  if (typeof window === 'undefined') return 'bright-minimal';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'bright-minimal' || stored === 'default') return stored;
  return 'bright-minimal';
}

function applyUiMode(mode: UiMode) {
  document.documentElement.dataset.uiMode = mode;
}

const UiModeContext = createContext<{
  uiMode: UiMode;
  setUiMode: (mode: UiMode) => void;
  toggleUiMode: () => void;
}>({ uiMode: 'bright-minimal', setUiMode: () => {}, toggleUiMode: () => {} });

export function UiModeProvider({ children }: { children: React.ReactNode }) {
  const [uiMode, setUiModeState] = useState<UiMode>(readStoredMode);

  useEffect(() => {
    applyUiMode(uiMode);
    localStorage.setItem(STORAGE_KEY, uiMode);
  }, [uiMode]);

  const setUiMode = useCallback((mode: UiMode) => {
    setUiModeState(mode);
  }, []);

  const toggleUiMode = useCallback(() => {
    setUiModeState(prev => (prev === 'default' ? 'bright-minimal' : 'default'));
  }, []);

  return (
    <UiModeContext.Provider value={{ uiMode, setUiMode, toggleUiMode }}>
      {children}
    </UiModeContext.Provider>
  );
}

export function useUiMode() {
  const ctx = useContext(UiModeContext);
  if (!ctx) throw new Error('useUiMode must be used within UiModeProvider');
  return ctx;
}
