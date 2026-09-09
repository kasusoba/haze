import { browser } from "wxt/browser";
import type { Rule } from "./types";

// Persisted shape in browser.storage.sync.
export interface HazeState {
  globalEnabled: boolean;
  /** hostKey -> true when the site is explicitly turned off (default: on). */
  siteDisabled: Record<string, boolean>;
  /** hostKey -> the user's rules for that site (the only rule store). */
  userRules: Record<string, Rule[]>;
}

const DEFAULTS: HazeState = {
  globalEnabled: true,
  siteDisabled: {},
  userRules: {},
};

/**
 * Rules live in one item per site (`rules:example.com`) rather than in a single
 * `userRules` map. Chrome caps a sync item at 8 KB (QUOTA_BYTES_PER_ITEM), and
 * one map holding every site crossed it after roughly forty rules, at which
 * point *every* further write failed with "kQuotaBytesPerItem quota exceeded",
 * even on a site with no rules yet. Per-site items spend that budget per site
 * and raise the real ceiling to the 100 KB / 512 item profile quotas.
 */
const RULES_PREFIX = "rules:";

/** Key of the pre-2.5.4 single-item map. Migrated away in background.ts. */
const LEGACY_RULES_KEY = "userRules";

const rulesKey = (key: string) => `${RULES_PREFIX}${key}`;

/**
 * A site's rules no longer fit in one sync item. Callers show this instead of
 * the browser's own "Resource::kQuotaBytesPerItem quota exceeded", which tells
 * the user nothing about what to do.
 */
export class RuleQuotaError extends Error {
  constructor(key: string) {
    super(
      `Too many rules to sync for ${key}. Delete or shorten some rules on this site.`,
    );
    this.name = "RuleQuotaError";
  }
}

export async function loadState(): Promise<HazeState> {
  const items = await browser.storage.sync.get(null);
  const userRules: Record<string, Rule[]> = {};
  // The legacy map is the base layer so rules stay readable on a device that
  // has synced down old data but has not run the migration yet (onInstalled
  // fires on update, but a content script can load first).
  for (const [key, rules] of Object.entries(
    (items[LEGACY_RULES_KEY] ?? {}) as Record<string, Rule[]>,
  )) {
    if (Array.isArray(rules) && rules.length) userRules[key] = rules;
  }
  for (const [item, rules] of Object.entries(items)) {
    if (!item.startsWith(RULES_PREFIX) || !Array.isArray(rules)) continue;
    userRules[item.slice(RULES_PREFIX.length)] = rules as Rule[];
  }
  return {
    globalEnabled:
      (items.globalEnabled as boolean | undefined) ?? DEFAULTS.globalEnabled,
    siteDisabled:
      (items.siteDisabled as Record<string, boolean> | undefined) ?? {},
    userRules,
  };
}

export async function setGlobalEnabled(value: boolean): Promise<void> {
  await browser.storage.sync.set({ globalEnabled: value });
}

export async function setSiteDisabled(
  key: string,
  disabled: boolean,
): Promise<void> {
  const { siteDisabled } = await loadState();
  if (disabled) siteDisabled[key] = true;
  else delete siteDisabled[key];
  await browser.storage.sync.set({ siteDisabled });
}

export async function getUserRules(key: string): Promise<Rule[]> {
  const item = rulesKey(key);
  const got = await browser.storage.sync.get([item, LEGACY_RULES_KEY]);
  if (Array.isArray(got[item])) return got[item] as Rule[];
  const legacy = got[LEGACY_RULES_KEY] as Record<string, Rule[]> | undefined;
  return legacy?.[key] ?? [];
}

export async function setUserRules(key: string, rules: Rule[]): Promise<void> {
  if (!rules.length) {
    await browser.storage.sync.remove(rulesKey(key));
    return;
  }
  try {
    await browser.storage.sync.set({ [rulesKey(key)]: rules });
  } catch (err) {
    if (isQuotaError(err)) throw new RuleQuotaError(key);
    throw err;
  }
}

function isQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  // Chrome's write rate limit also says "quota" but has nothing to do with
  // size, and telling the user to delete rules would send them the wrong way.
  if (/WRITE_OPERATIONS/i.test(message)) return false;
  return /quota/i.test(message);
}

export async function addUserRule(key: string, rule: Rule): Promise<void> {
  const rules = await getUserRules(key);
  rules.push(rule);
  await setUserRules(key, rules);
}

/**
 * Append rules for a site, skipping any whose id is already present so the call
 * is idempotent (used to seed the default rule without clobbering user edits).
 */
export async function addRulesIfAbsent(
  key: string,
  rules: Rule[],
): Promise<void> {
  const existing = await getUserRules(key);
  const have = new Set(existing.map((r) => r.id));
  const fresh = rules.filter((r) => !have.has(r.id));
  if (!fresh.length) return;
  await setUserRules(key, [...existing, ...fresh]);
}

/**
 * Replace the whole rule store, one item per site (used by import). Returns the
 * sites whose rules do not fit one sync item; those end up with no rules.
 */
export async function replaceAllUserRules(
  userRules: Record<string, Rule[]>,
): Promise<string[]> {
  const { userRules: current } = await loadState();
  for (const key of Object.keys(current)) {
    await browser.storage.sync.remove(rulesKey(key));
  }
  await browser.storage.sync.remove(LEGACY_RULES_KEY);
  const rejected: string[] = [];
  for (const [key, rules] of Object.entries(userRules)) {
    if (!rules.length) continue;
    try {
      await setUserRules(key, rules);
    } catch (err) {
      if (!(err instanceof RuleQuotaError)) throw err;
      rejected.push(key);
    }
  }
  return rejected;
}

/** Move a pre-2.5.4 single-item `userRules` map to one item per site. */
export async function migrateUserRules(): Promise<void> {
  const got = await browser.storage.sync.get(LEGACY_RULES_KEY);
  const legacy = got[LEGACY_RULES_KEY] as Record<string, Rule[]> | undefined;
  if (!legacy) return;
  for (const [key, rules] of Object.entries(legacy)) {
    if (!Array.isArray(rules) || !rules.length) continue;
    const item = rulesKey(key);
    const existing = await browser.storage.sync.get(item);
    if (Array.isArray(existing[item])) continue;
    try {
      await setUserRules(key, rules);
    } catch (err) {
      // A site over the per-item cap keeps its rules in the legacy map, which
      // loadState still reads, so nothing is lost even though the split fails.
      if (!(err instanceof RuleQuotaError)) throw err;
      return;
    }
  }
  await browser.storage.sync.remove(LEGACY_RULES_KEY);
}

// --- granted dynamic origins ---
// Stored in storage.sync so the set of sites the user runs Haze on travels
// between devices. The actual host permission can't be synced (the browser
// requires a user gesture to grant it), so on each device we re-register only
// the origins that device has permission for; the rest are surfaced as a
// one-click grant prompt in the options page. See background.ts / options.

export async function getGrantedOrigins(): Promise<string[]> {
  const { grantedOrigins } = await browser.storage.sync.get({
    grantedOrigins: [] as string[],
  });
  return grantedOrigins as string[];
}

export async function addGrantedOrigin(pattern: string): Promise<void> {
  const origins = await getGrantedOrigins();
  if (!origins.includes(pattern)) {
    origins.push(pattern);
    await browser.storage.sync.set({ grantedOrigins: origins });
  }
}
