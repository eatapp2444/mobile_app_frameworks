import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { NavItem } from './config';

/** Tab name (`open/tab/<name>`) or an already-resolved nav item (short aliases). */
export type ActivateTab = (target: string | NavItem) => boolean;

type Ctx = {
  /** Same as tapping a tab (or More). Group tabs open their sheet; unknown names no-op. */
  activateTab: ActivateTab;
  registerActivateTab: (fn: ActivateTab) => () => void;
};

const TabActionsContext = createContext<Ctx>({
  activateTab: () => false,
  registerActivateTab: () => () => {},
});

export function useTabActions() {
  return useContext(TabActionsContext);
}

/**
 * Lets homepage HtmlView ask TabBar to run the same `go(item)` path as a tab tap.
 * TabBar registers; HtmlView calls `activateTab`. Missing handler / unknown name → false.
 */
export function TabActionsProvider({ children }: { children: React.ReactNode }) {
  const handler = useRef<ActivateTab | null>(null);
  const activateTab = useCallback<ActivateTab>((name) => handler.current?.(name) ?? false, []);
  const registerActivateTab = useCallback((fn: ActivateTab) => {
    handler.current = fn;
    return () => {
      if (handler.current === fn) handler.current = null;
    };
  }, []);
  const value = useMemo(() => ({ activateTab, registerActivateTab }), [activateTab, registerActivateTab]);
  return <TabActionsContext.Provider value={value}>{children}</TabActionsContext.Provider>;
}
