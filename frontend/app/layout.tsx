import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Incident Copilot",
  description:
    "AI-powered incident triage, root-cause, and runbook console — Datadog-style dark UI.",
}

// No-flash theme bootstrap. Runs before paint so the correct class is on <html>
// before any styled pixels land. Defaults to dark unless the user explicitly
// toggled to light (persisted in localStorage as "incident-copilot:theme").
// Kept as a string so Next's static rendering can inline it without hydration churn.
const THEME_BOOTSTRAP = `
(function(){
  try {
    var saved = localStorage.getItem('incident-copilot:theme');
    var theme = saved === 'light' ? 'light' : 'dark';
    var root = document.documentElement;
    root.classList.remove('light','dark');
    root.classList.add(theme);
    root.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }
})();
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      // `dark` is the SSR default so the first paint is already the dark shell.
      // The inline script below will swap to `light` synchronously if the user
      // has opted in — preventing the "flash of wrong theme".
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          // Must run before paint; dangerouslySetInnerHTML avoids JSX escaping.
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
