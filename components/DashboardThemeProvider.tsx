"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type DashboardThemeContextValue = {
  isDark: boolean;
  setIsDark: (value: boolean) => void;
};

const DashboardThemeContext = createContext<DashboardThemeContextValue | null>(null);

const STORAGE_KEY = "lanceiq-dashboard-theme";

export function useDashboardTheme() {
  const ctx = useContext(DashboardThemeContext);
  if (!ctx) {
    throw new Error("useDashboardTheme must be used within DashboardThemeProvider");
  }
  return ctx;
}

export default function DashboardThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark") {
      setIsDark(true); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
  }, [isDark]);

  const value = useMemo(() => ({ isDark, setIsDark }), [isDark]);

  return (
    <DashboardThemeContext.Provider value={value}>
      <div className={`dashboard-theme ${isDark ? "dashboard-dark" : ""}`}>
        {children}
      </div>
    </DashboardThemeContext.Provider>
  );
}
