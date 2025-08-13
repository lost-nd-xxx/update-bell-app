import { useState, useEffect } from "react";

export type Theme = "light" | "dark" | "system";

export const useTheme = (): [Theme, (theme: Theme) => void] => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("update-bell-theme");
    if (saved && ["light", "dark", "system"].includes(saved)) {
      return saved as Theme;
    }
    return "system";
  });

  // テーマ適用・保存
  useEffect(() => {
    const root = document.documentElement;
    
    if (theme === "system") {
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", systemDark);
    } else {
      root.classList.toggle("dark", theme === "dark");
    }
    
    localStorage.setItem("update-bell-theme", theme);
  }, [theme]);

  return [theme, setTheme];
};