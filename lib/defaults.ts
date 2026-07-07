// The one rule Haze ships with: blur Google Search's review stars / ratings.
// It's seeded into the user's own rules on install (see background.ts), so it's
// editable and deletable like anything they create — no separate layer.

import { DEFAULT_BG, DEFAULT_INTENSITY, type Rule } from "./types";

const GOOGLE_TLDS = [
  "com",
  "co.uk",
  "ca",
  "com.au",
  "de",
  "fr",
  "es",
  "it",
  "nl",
  "co.in",
  "co.jp",
  "com.br",
  "ru",
  "pl",
];

/** Match patterns granted at install so the default rule works out of the box. */
export const GOOGLE_SEARCH_MATCHES: string[] = GOOGLE_TLDS.map(
  (tld) => `*://www.google.${tld}/search*`,
);

const GOOGLE_HOSTS = GOOGLE_TLDS.map((tld) => `google.${tld}`);

/** hostKey the default rule is stored under. */
export const DEFAULT_HOST_KEY = "google.com";

/** Stable id so seeding stays idempotent and deletion sticks. */
export const DEFAULT_RULE_ID = "default:google";

/** Does this host have static (install-time) permission? Then no per-site grant. */
export function isBuiltinHost(hostname: string): boolean {
  const h = hostname.replace(/^www\./i, "").toLowerCase();
  return GOOGLE_HOSTS.includes(h);
}

/** The rules Haze seeds on first run. */
export function defaultRules(): Rule[] {
  return [
    {
      id: DEFAULT_RULE_ID,
      selector:
        'g-review-stars, g-review-stars ~ span, .a19vA, .uo4vr, .tsAqzf, [data-attrid="kc:/ugc:user_reviews"], [data-attrid="kc:/film/film:reviews"], [data-attrid="kc:/book/book:reviews"], [data-attrid="kc:/tv/tv_program:reviews"]',
      effect: "blur",
      intensity: 15,
      grayscale: false,
      reveal: "hover",
      bg: DEFAULT_BG,
      enabled: true,
    },
  ];
}

// Re-export so callers don't need to reach into types for the seed defaults.
export { DEFAULT_BG, DEFAULT_INTENSITY };
