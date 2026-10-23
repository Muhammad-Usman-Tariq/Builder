/**
 * Allowlist for benign, development-only console noise during Playwright tests.
 *
 * CRITICAL RULE:
 * Never add real errors here (e.g. React render errors, hydration errors,
 * failed HTTP requests, uncaught exceptions, invalid prop warnings).
 * Every entry must have a comment documenting why it is purely dev-only noise.
 */

export interface ConsoleAllowlistEntry {
  pattern: RegExp | string;
  reason: string;
}

export const CONSOLE_ALLOWLIST: ConsoleAllowlistEntry[] = [
  {
    // React DevTools browser extension suggestion printed by React in dev mode
    pattern: /Download the React DevTools for a better development experience/i,
    reason: "Dev-only recommendation from React engine suggesting DevTools installation",
  },
  {
    // Next.js Fast Refresh and HMR status logs printed to browser console
    pattern: /\[Fast Refresh\]/i,
    reason: "Next.js dev server hot reload status indicator",
  },
  {
    // Webpack HMR compilation notifications
    pattern: /\[HMR\]/i,
    reason: "Webpack Hot Module Replacement runtime status indicator",
  },
  {
    // Next.js development router prefetch / compiler heartbeat
    pattern: /\[next\]/i,
    reason: "Next.js dev client runtime internal messaging",
  },
];

export function isAllowedConsoleMessage(text: string): boolean {
  return CONSOLE_ALLOWLIST.some((entry) =>
    typeof entry.pattern === "string"
      ? text.includes(entry.pattern)
      : entry.pattern.test(text)
  );
}
