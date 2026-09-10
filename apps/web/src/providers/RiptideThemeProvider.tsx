"use client";

import { createContext, useEffect, type ReactNode } from "react";

const ThemeContext = createContext({ theme: "dark" as const });

export function RiptideThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
  }, []);

  return <ThemeContext.Provider value={{ theme: "dark" }}>{children}</ThemeContext.Provider>;
}

/** @deprecated Dark-only theme; kept for compatibility. */
export function useTheme() {
  return { theme: "dark" as const, toggle: () => {} };
}
