// Core data model for Haze. See docs/DESIGN.md.

/**
 * How a matched element is concealed:
 * - `blur`        - Gaussian blur; peek by revealing.
 * - `scratchcard` - blur *plus* an opaque card overlay; peek by revealing.
 * - `hide`        - removed from layout entirely (display:none), no reveal.
 */
export type Effect = "blur" | "scratchcard" | "hide";
export type Reveal = "hover" | "click";

/** A single rule the user owns (created via the picker or seeded as a default). */
export interface Rule {
  id: string;
  /** CSS selector. May be a comma-separated group; the engine splits it. */
  selector: string;
  effect: Effect;
  /** Blur radius in px. */
  intensity: number;
  /** Also desaturate - useful for color-coded indicators. */
  grayscale: boolean;
  reveal: Reveal;
  /** Scratchcard overlay color; falls back to the site/global default. */
  bg?: string;
  /**
   * Optional regex source. When set, the effect targets only the substrings
   * matching this pattern inside the matched element (wrapped in spans at
   * runtime) rather than the whole element - for redacting a rating that lives
   * as a bare text node in a larger line. See lib/text.ts.
   */
  text?: string;
  /**
   * Optional label anchor. When set, the rule matches only those `selector`
   * elements immediately preceded by a label whose text is this string (the
   * `Label: value` row shape) - the only reliable way to target one field on
   * sites where every value shares the same classes. Resolved in JS by the
   * engine, not via CSS. See lib/anchor.ts.
   */
  label?: string;
  enabled: boolean;
}

export const DEFAULT_INTENSITY = 8;
export const DEFAULT_EFFECT: Effect = "blur";
export const DEFAULT_REVEAL: Reveal = "hover";
/** Neutral mid-gray scratchcard background when a site sets none. */
export const DEFAULT_BG = "#888";

/** The effects offered in the UI, in display order. */
export const EFFECTS: Effect[] = ["blur", "scratchcard", "hide"];

/**
 * Coerce a stored/imported effect to the current set. Pre-2.4 shipped a
 * scratchcard-*only* option and a `both` (blur+card) option; both now collapse
 * to `scratchcard`, which means blur *and* the card overlay. Anything
 * unrecognized falls back to `blur`.
 */
export function normalizeEffect(effect: string): Effect {
  if (effect === "blur" || effect === "hide") return effect;
  if (effect === "scratchcard" || effect === "both") return "scratchcard";
  return "blur";
}
