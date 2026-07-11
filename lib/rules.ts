import { hostKey } from "./host";
import type { HazeState } from "./storage";
import { DEFAULT_BG, normalizeEffect, type Rule } from "./types";

export interface EffectiveRules {
  rules: Rule[];
  /** Default scratchcard background (per-rule `bg` overrides this). */
  defaultBg: string;
}

/** The rules that apply to a host: the user's own, minus disabled ones. */
export function effectiveRulesFor(
  hostname: string,
  state: HazeState,
): EffectiveRules {
  const user = state.userRules[hostKey(hostname)] ?? [];
  // Normalize defensively so rules stored/imported before the effect model
  // changed (e.g. legacy `both`) still render correctly, migration or not.
  const rules = user
    .filter((r) => r.enabled)
    .map((r) => ({ ...r, effect: normalizeEffect(r.effect) }));
  return { rules, defaultBg: DEFAULT_BG };
}
