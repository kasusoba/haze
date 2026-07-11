import type { Rule } from "./types";

export const ACTIVE_CLASS = "haze-active";
export const SUPPRESSED_CLASS = "haze-suppressed";
export const REVEALED_CLASS = "haze-revealed";
/** Wrapper applied to text-redaction matches (see lib/text.ts). */
export const TEXT_CLASS = "haze-text";
/** Separate gate used by the picker's live preview. */
export const PREVIEW_CLASS = "haze-preview";

/** Split a comma-separated selector group into individual selectors. */
export function splitSelector(selector: string): string[] {
  return selector
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Every individual selector across a set of rules (for match collection). */
export function allSelectorParts(rules: Rule[]): string[] {
  return rules.flatMap((r) => splitSelector(r.selector));
}

function blurFilter(rule: Rule): string {
  return `blur(${rule.intensity}px)${rule.grayscale ? " grayscale(1)" : ""}`;
}

function revealedFilter(rule: Rule): string {
  return rule.grayscale ? "blur(0) grayscale(0)" : "none";
}

/**
 * Generate the stylesheet for a set of rules, gated behind `html.<gate>` so the
 * global/site toggle is a single class flip. The picker passes PREVIEW_CLASS to
 * render a live preview without touching the real engine state.
 */
export function generateCss(
  rules: Rule[],
  defaultBg: string,
  gate: string = ACTIVE_CLASS,
  textClass: string = TEXT_CLASS,
): string {
  const out: string[] = [];

  for (const rule of rules) {
    const bg = rule.bg ?? defaultBg;
    // `scratchcard` is blur *plus* the card overlay; `hide` removes the element.
    const wantsBlur = rule.effect === "blur" || rule.effect === "scratchcard";
    const wantsCard = rule.effect === "scratchcard";
    const wantsHide = rule.effect === "hide";

    for (const part of splitSelector(rule.selector)) {
      const base = `html.${gate} ${part}`;
      // Text rules act on the wrapped substrings inside the match; element
      // rules act on the match itself. Reveal is still driven by the matched
      // element so click/hover behaves the same in both modes.
      const target = rule.text ? `${base} .${textClass}` : base;
      const revealed = rule.text
        ? `${base}.${REVEALED_CLASS} .${textClass}`
        : `${base}.${REVEALED_CLASS}`;

      // Hide: no reveal, no overlay - just take it out of the flow.
      if (wantsHide) {
        out.push(`${target}{display:none !important}`);
        continue;
      }

      if (wantsBlur) {
        out.push(`${target}{filter:${blurFilter(rule)};transition:filter .2s}`);
        if (rule.reveal === "hover") {
          out.push(
            `${target}:hover{filter:${revealedFilter(rule)} !important;transition-delay:.3s !important}`,
          );
        } else {
          out.push(`${revealed}{filter:${revealedFilter(rule)} !important}`);
        }
      }

      if (wantsCard) {
        out.push(`${target}{position:relative}`);
        out.push(
          `${target}::after{content:'';position:absolute;inset:0;background:${bg};border-radius:4px;pointer-events:none;opacity:1;transition:opacity 0s}`,
        );
        if (rule.reveal === "hover") {
          out.push(
            `${target}:hover::after{opacity:0;transition:opacity .2s;transition-delay:.3s}`,
          );
        } else {
          out.push(`${revealed}::after{opacity:0;transition:opacity .2s}`);
        }
      }

      if (rule.reveal === "click") out.push(`${base}{cursor:pointer}`);
    }
  }

  // Containment dedupe: an inner matched element nested in another matched
  // element is suppressed (outermost-wins). See docs/DESIGN.md §3b.
  out.push(`html.${gate} .${SUPPRESSED_CLASS}{filter:none !important}`);
  out.push(`html.${gate} .${SUPPRESSED_CLASS}::after{display:none !important}`);

  return out.join("\n");
}

/** Individual selectors of rules whose reveal mode is click (hidden rules never reveal). */
export function clickSelectorParts(rules: Rule[]): string[] {
  return allSelectorParts(
    rules.filter((r) => r.reveal === "click" && r.effect !== "hide"),
  );
}
