"use client"

import { Moon, Sun } from "lucide-react"
import { useCallback, useState, useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"

type Theme = "light" | "dark"

const STORAGE_KEY = "incident-copilot:theme"

// Subscribe to <html> class changes so the toggle button stays in sync even
// if something else flips the theme (e.g. a future keyboard shortcut).
function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {}
  const observer = new MutationObserver(onStoreChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  })
  return () => observer.disconnect()
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("light") ? "light" : "dark"
}

// On the server we don't have a DOM — return `null` so we can hide the icon
// on the first render and avoid hydration mismatch.
function getServerSnapshot(): Theme | null {
  return null
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )

  // `pressing` is a tiny UI flag so the button feels responsive even if the
  // MutationObserver fires a tick later than the click handler.
  const [pressing, setPressing] = useState(false)

  const toggle = useCallback(() => {
    const current: Theme =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("light")
        ? "light"
        : "dark"
    const next: Theme = current === "light" ? "dark" : "light"
    const root = document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(next)
    root.style.colorScheme = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // localStorage blocked (private mode / storage quota) — ignore, the
      // toggle still works for this session, just won't persist.
    }
    setPressing((p) => !p)
  }, [])

  const label =
    theme === null
      ? "Toggle theme"
      : theme === "light"
        ? "Switch to dark mode"
        : "Switch to light mode"

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={label}
      title={label}
      data-pressing={pressing ? "1" : "0"}
      className="w-full justify-start gap-2 text-sidebar-foreground/80 hover:text-sidebar-foreground"
    >
      {theme === "light" ? (
        <Moon className="size-4" />
      ) : theme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <span className="size-4" />
      )}
      <span className="text-xs">
        {theme === "light"
          ? "Dark mode"
          : theme === "dark"
            ? "Light mode"
            : "Theme"}
      </span>
    </Button>
  )
}
