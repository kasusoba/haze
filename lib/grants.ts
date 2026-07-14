// Host-permission grants for user rules. Rules sync across devices but host
// permissions don't (the browser requires a user gesture to grant one), so on
// each device we surface the sites that still need permission and let the user
// grant them all in one prompt. Shared by the popup and options page.

import { browser } from "wxt/browser";
import { isBuiltinHost } from "./defaults";
import { originPatternForKey } from "./host";
import type { Rule } from "./types";

/** Origins for these rules that this device lacks permission for. */
export async function missingGrantsFor(
  userRules: Record<string, Rule[]>,
): Promise<string[]> {
  const patterns = Object.keys(userRules)
    .filter((k) => (userRules[k]?.length ?? 0) > 0 && !isBuiltinHost(k))
    .map(originPatternForKey);
  const missing: string[] = [];
  for (const p of patterns) {
    if (!(await browser.permissions.contains({ origins: [p] })))
      missing.push(p);
  }
  return missing;
}

/**
 * Request permission for the given origins in one browser prompt, then have the
 * background register their content scripts so effects take hold without picking
 * on each site. Returns false if denied or the prompt failed.
 */
export async function requestAndRegisterOrigins(
  patterns: string[],
): Promise<boolean> {
  if (!patterns.length) return false;
  let granted = false;
  try {
    granted = await browser.permissions.request({ origins: patterns });
  } catch {
    granted = false;
  }
  if (!granted) return false;
  await browser.runtime.sendMessage({
    type: "haze:register-origins",
    patterns,
  });
  return true;
}
