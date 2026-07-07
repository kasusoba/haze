import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { anchorClass, anchorMatches } from "../lib/anchor";
import { GOOGLE_SEARCH_MATCHES } from "../lib/defaults";
import {
  ACTIVE_CLASS,
  allSelectorParts,
  clickSelectorParts,
  generateCss,
  REVEALED_CLASS,
  SUPPRESSED_CLASS,
  TEXT_CLASS,
} from "../lib/css";
import { hostKey } from "../lib/host";
import { effectiveRulesFor } from "../lib/rules";
import { type HazeState, loadState } from "../lib/storage";
import { unwrapTextMatches, wrapTextMatches } from "../lib/text";
import type { Rule } from "../lib/types";

const STYLE_ID = "haze-style";
const INIT_FLAG = "__hazeEngineInit";

// Statically registered on Google Search (where the default rule lives); also
// injected at runtime (same file) on user-granted origins by the background.
// Guard against running twice on a page that gets both.
export default defineContentScript({
  matches: GOOGLE_SEARCH_MATCHES,
  runAt: "document_start",
  allFrames: false,
  main() {
    const w = window as unknown as Record<string, boolean>;
    if (w[INIT_FLAG]) return;
    w[INIT_FLAG] = true;
    runEngine();
  },
});

function runEngine(): void {
  const hostname = location.hostname;
  const key = hostKey(hostname);

  let clickSelector = "";
  let unionSelector = "";
  let textRules: Rule[] = [];
  let anchorRules: Rule[] = [];
  let observer: MutationObserver | null = null;

  const style = document.createElement("style");
  style.id = STYLE_ID;

  function injectStyle(): void {
    const root = document.head || document.documentElement;
    if (style.parentNode !== root) root.appendChild(style);
  }

  function applyEnabled(state: HazeState): void {
    const enabled = state.globalEnabled && !state.siteDisabled[key];
    document.documentElement.classList.toggle(ACTIVE_CLASS, enabled);
  }

  /** Outermost-wins: suppress any matched element nested inside another match. */
  function runContainment(): void {
    if (!unionSelector) return;
    let matched: Element[];
    try {
      matched = Array.from(document.querySelectorAll(unionSelector));
    } catch {
      return;
    }
    const set = new Set(matched);
    for (const el of matched) {
      let suppressed = false;
      let parent = el.parentElement;
      while (parent) {
        if (set.has(parent)) {
          suppressed = true;
          break;
        }
        parent = parent.parentElement;
      }
      el.classList.toggle(SUPPRESSED_CLASS, suppressed);
    }
  }

  // Re-wrap text-redaction matches (idempotent; skips already-wrapped spans).
  function applyTextWrap(): void {
    for (const r of textRules) {
      if (r.text) wrapTextMatches(r.selector, r.text, TEXT_CLASS);
    }
  }

  // Tag label-anchored matches with their per-rule marker class so the CSS
  // pipeline (which only speaks selectors) can style them. Re-run on mutation
  // since cards stream in lazily; clearing first keeps it idempotent.
  function applyAnchors(): void {
    for (const r of anchorRules) {
      if (!r.label) continue;
      const cls = anchorClass(r.id);
      for (const el of document.querySelectorAll(`.${cls}`))
        el.classList.remove(cls);
      for (const el of anchorMatches(r.selector, r.label))
        el.classList.add(cls);
    }
  }

  // An anchored rule's real CSS target is its marker class, not its raw
  // selector (which would match every same-classed value, ignoring the label).
  function asCssRule(r: Rule): Rule {
    return r.label ? { ...r, selector: `.${anchorClass(r.id)}` } : r;
  }

  let debounce = 0;
  function scheduleWork(): void {
    if (debounce) return;
    debounce = window.setTimeout(() => {
      debounce = 0;
      applyAnchors();
      runContainment();
      applyTextWrap();
    }, 150);
  }

  function rebuild(state: HazeState): void {
    const { rules, defaultBg } = effectiveRulesFor(hostname, state);
    // Anchored rules are matched in JS; everywhere downstream we use their
    // marker class so the CSS, containment, click and text paths stay pure CSS.
    anchorRules = rules.filter((r) => r.label);
    const cssRules = rules.map(asCssRule);
    style.textContent = generateCss(cssRules, defaultBg);
    injectStyle();
    // Text rules redact substrings, not whole elements, so they're left out of
    // the element-level containment union.
    unionSelector = allSelectorParts(cssRules.filter((r) => !r.text)).join(",");
    clickSelector = clickSelectorParts(cssRules).join(",");
    textRules = cssRules.filter((r) => r.text);
    applyEnabled(state);
    applyAnchors();
    runContainment();
    // Re-wrap from scratch: old wrappers may belong to rules that just changed.
    unwrapTextMatches(TEXT_CLASS);
    applyTextWrap();
    if (!observer) {
      observer = new MutationObserver(scheduleWork);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
  }

  // Click-to-reveal: toggle the revealed class on the effective target.
  document.addEventListener(
    "click",
    (e) => {
      if (!clickSelector) return;
      if (!document.documentElement.classList.contains(ACTIVE_CLASS)) return;
      const target = e.target as Element | null;
      const el = target?.closest?.(clickSelector);
      if (el && !el.classList.contains(SUPPRESSED_CLASS)) {
        el.classList.toggle(REVEALED_CLASS);
      }
    },
    true,
  );

  loadState().then(rebuild);

  browser.storage.onChanged.addListener((_changes, area) => {
    if (area !== "sync") return;
    loadState().then(rebuild);
  });
}
