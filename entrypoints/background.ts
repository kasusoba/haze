import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { DEFAULT_HOST_KEY, defaultRules, isBuiltinHost } from "../lib/defaults";
import { hostKey, originPattern } from "../lib/host";
import type { CreateRuleResponse, HazeMessage } from "../lib/messages";
import {
  addGrantedOrigin,
  addRulesIfAbsent,
  addUserRule,
  getGrantedOrigins,
  loadState,
} from "../lib/storage";
import { DEFAULT_BG, normalizeEffect, type Rule } from "../lib/types";

const ENGINE_FILE = "/content-scripts/engine.js";
const SEEDED_KEY = "defaultsSeeded";

// Maps the original per-site toggle keys to the new site keys. Old value `true`
// meant "show ratings" (blur off) -> new siteDisabled[key] = true.
const LEGACY_KEYS: Record<string, string> = {
  imdb: "imdb.com",
  mal: "myanimelist.net",
  goodreads: "goodreads.com",
  letterboxd: "letterboxd.com",
  google: "google.com",
  trakt: "trakt.tv",
  anilist: "anilist.co",
  hardcover: "hardcover.app",
};

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    await migrateLegacy();
    await migrateEffects();
    await migrateGrantedOrigins();
    await seedDefaults();
    await reRegisterDynamic();
  });
  browser.runtime.onStartup.addListener(reRegisterDynamic);

  browser.runtime.onMessage.addListener((message, sender) => {
    const msg = message as HazeMessage;
    if (msg?.type === "haze:create-rule") {
      return handleCreateRule(msg, sender);
    }
    if (msg?.type === "haze:register-origins") {
      return handleRegisterOrigins(msg);
    }
    return undefined;
  });
});

async function migrateLegacy(): Promise<void> {
  const legacy = await browser.storage.sync.get(Object.keys(LEGACY_KEYS));
  const { siteDisabled } = await loadState();
  let changed = false;
  for (const [oldKey, newKey] of Object.entries(LEGACY_KEYS)) {
    if (legacy[oldKey] === true && !siteDisabled[newKey]) {
      siteDisabled[newKey] = true;
      changed = true;
    }
  }
  if (changed) await browser.storage.sync.set({ siteDisabled });
}

/**
 * Fold legacy effect values into the current set (v2.4). The scratchcard-only
 * and `both` options were dropped; both become `scratchcard` (blur + card).
 */
async function migrateEffects(): Promise<void> {
  const { userRules } = await loadState();
  let changed = false;
  for (const rules of Object.values(userRules)) {
    for (const rule of rules) {
      const effect = normalizeEffect(rule.effect);
      if (effect !== rule.effect) {
        rule.effect = effect;
        changed = true;
      }
    }
  }
  if (changed) await browser.storage.sync.set({ userRules });
}

/**
 * Granted origins used to live in storage.local (per-device). Move any into the
 * synced list once so the set travels between devices, then drop the local copy.
 */
async function migrateGrantedOrigins(): Promise<void> {
  const got = await browser.storage.local.get("grantedOrigins");
  const local = (got.grantedOrigins as string[] | undefined) ?? [];
  if (!local.length) return;
  for (const pattern of local) await addGrantedOrigin(pattern);
  await browser.storage.local.remove("grantedOrigins");
}

/** Seed the bundled default rule once. The flag makes a later deletion stick. */
async function seedDefaults(): Promise<void> {
  const got = await browser.storage.local.get(SEEDED_KEY);
  if (got[SEEDED_KEY]) return;
  await addRulesIfAbsent(DEFAULT_HOST_KEY, defaultRules());
  await browser.storage.local.set({ [SEEDED_KEY]: true });
}

/** Re-register runtime content scripts for previously-granted custom origins. */
async function reRegisterDynamic(): Promise<void> {
  const origins = await getGrantedOrigins();
  if (!origins.length) return;
  let registered: { id: string }[] = [];
  try {
    registered = await browser.scripting.getRegisteredContentScripts();
  } catch {
    /* ignore */
  }
  const existing = new Set(registered.map((r) => r.id));
  for (const pattern of origins) {
    await registerForPattern(pattern, existing);
  }
}

async function registerForPattern(
  pattern: string,
  existing: Set<string>,
): Promise<void> {
  const id = `haze-${pattern}`;
  if (existing.has(id)) return;
  try {
    const ok = await browser.permissions.contains({ origins: [pattern] });
    if (!ok) return;
    await browser.scripting.registerContentScripts([
      {
        id,
        matches: [pattern],
        js: [ENGINE_FILE],
        runAt: "document_start",
        persistAcrossSessions: true,
      },
    ]);
  } catch {
    /* permission revoked or already registered - ignore */
  }
}

/**
 * Persist + register content scripts for origins the user granted while
 * importing. Permission is requested in the options page (needs a user
 * gesture); here we just record and register the ones now granted.
 */
async function handleRegisterOrigins(
  msg: Extract<HazeMessage, { type: "haze:register-origins" }>,
): Promise<{ ok: boolean }> {
  for (const pattern of msg.patterns) {
    if (!(await browser.permissions.contains({ origins: [pattern] }))) continue;
    await addGrantedOrigin(pattern);
    await registerForPattern(pattern, new Set());
  }
  return { ok: true };
}

async function handleCreateRule(
  msg: Extract<HazeMessage, { type: "haze:create-rule" }>,
  sender: { tab?: { id?: number; url?: string } },
): Promise<CreateRuleResponse> {
  const url = sender.tab?.url;
  const tabId = sender.tab?.id;
  if (!url || tabId == null) return { ok: false, error: "no tab" };

  const hostname = new URL(url).hostname;
  const key = hostKey(hostname);

  const rule: Rule = {
    id: cryptoId(),
    selector: msg.selector,
    effect: msg.effect,
    intensity: msg.intensity,
    grayscale: msg.grayscale,
    reveal: msg.reveal,
    bg: msg.bg ?? DEFAULT_BG,
    text: msg.text,
    label: msg.label,
    enabled: true,
  };
  await addUserRule(key, rule);

  // Persist a runtime content script for non-builtin sites so it survives reloads.
  // Google Search already has a static host permission + registered script.
  if (!isBuiltinHost(hostname)) {
    const pattern = originPattern(url);
    await addGrantedOrigin(pattern);
    await registerForPattern(pattern, new Set());
  }

  // Apply immediately in the current tab (no reload needed).
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: [ENGINE_FILE],
    });
  } catch (err) {
    return { ok: false, error: String(err) };
  }
  return { ok: true };
}

function cryptoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `r-${Math.abs(hashString(Date.now().toString()))}`;
  }
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}
