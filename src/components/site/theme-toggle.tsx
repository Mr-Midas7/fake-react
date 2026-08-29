import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "fake-rider-theme";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

function preferredTheme(): Theme {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

type ThemeToggleProps = {
  className?: string;
  showLabel?: boolean;
};

/** A shared, persisted appearance switch for public pages and the admin console. */
export function ThemeToggle({ className, showLabel = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const initialTheme = preferredTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const nextTheme: Theme = theme === "dark" ? "light" : "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size={showLabel ? "sm" : "icon"}
      className={cn(showLabel && "gap-2", className)}
      onClick={() => {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        setTheme(nextTheme);
        applyTheme(nextTheme);
      }}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
      {showLabel && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
    </Button>
  );
}
