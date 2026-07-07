import { hostKey } from "./host";
import type { HazeState } from "./storage";
import { DEFAULT_BG, type Rule } from "./types";

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
  return { rules: user.filter((r) => r.enabled), defaultBg: DEFAULT_BG };
}
