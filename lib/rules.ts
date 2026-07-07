import { COMMUNITY_SITES, type CommunitySite } from "./community-rules";
import { hostKey, hostMatchesSuffix } from "./host";
import type { HazeState } from "./storage";
import { DEFAULT_BG, DEFAULT_INTENSITY, type Rule } from "./types";

/** Stable id for a rule materialized from a built-in example: `example:<siteId>#<index>`. */
export function exampleRuleId(siteId: string, index: number): string {
  return `example:${siteId}#${index}`;
}

/** The bundled example sites whose hosts match `hostname`. */
export function communitySitesFor(hostname: string): CommunitySite[] {
  return COMMUNITY_SITES.filter((site) =>
    site.hosts.some((suffix) => hostMatchesSuffix(hostname, suffix)),
  );
}

/** hostKey the example rules for a site are stored under when added. */
export function exampleSiteKey(site: CommunitySite): string {
  return hostKey(site.hosts[0] ?? "");
}

/** Materialize a site's examples into full Rule objects (for preview / adding). */
export function exampleRulesForSite(site: CommunitySite): Rule[] {
  return site.rules.map((cr, index) => ({
    id: exampleRuleId(site.id, index),
    selector: cr.selector,
    effect: cr.effect,
    intensity: cr.intensity ?? DEFAULT_INTENSITY,
    grayscale: cr.grayscale ?? false,
    reveal: "hover" as const,
    bg: site.bg ?? DEFAULT_BG,
    text: cr.text,
    enabled: true,
  }));
}

/** True when every one of a site's example rules is already in the user's rules. */
export function isExampleSiteAdded(
  site: CommunitySite,
  state: HazeState,
): boolean {
  const existing = new Set(
    (state.userRules[exampleSiteKey(site)] ?? []).map((r) => r.id),
  );
  return site.rules.every((_, index) =>
    existing.has(exampleRuleId(site.id, index)),
  );
}

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
