// Label-anchored matching. CSS cannot select an element by a sibling's text, so
// "the value whose label is Score" - the ubiquitous `Label: value` row - is
// unreachable with a pure selector: every value shares the same classes and the
// rows reorder between pages. We resolve such matches in JS instead: among the
// elements a base CSS selector matches, keep only those immediately preceded by
// a label element whose text is the anchor. The engine tags the survivors with a
// per-rule marker class its normal CSS pipeline then styles, the same indirection
// the text-redaction feature uses. See docs/DESIGN.md §3d.

/** Longest a label may be; beyond this it's prose, not a field name. */
const MAX_LABEL_LEN = 40;

/**
 * Normalize a candidate label: collapse internal whitespace, drop a single
 * trailing colon (ASCII or fullwidth, e.g. `Score:`). Returns null when it's
 * empty or too long to plausibly be a field name - so prose siblings aren't
 * mistaken for labels, while colon-less labels (`Mean Score`) still qualify.
 */
function asLabel(text: string): string | null {
  const t = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[:：]$/, "")
    .trim();
  if (!t || t.length > MAX_LABEL_LEN) return null;
  return t;
}

/**
 * The label text that anchors `el`, or null: the normalized text of the
 * immediately preceding element sibling (typically a `type`/`label` cell in a
 * label/value row). A trailing colon is optional, so both `Score:` and
 * `Mean Score` work; the length bound keeps ordinary content from qualifying.
 */
export function labelOf(el: Element): string | null {
  const prev = el.previousElementSibling;
  if (!prev) return null;
  return asLabel(prev.textContent ?? "");
}

/** The anchor predicate: does `el`'s label equal `label`? */
export function matchesLabel(el: Element, label: string): boolean {
  return labelOf(el) === label;
}

/** Elements matching `selector` whose adjacent label is `label`. */
export function anchorMatches(selector: string, label: string): Element[] {
  let els: Element[];
  try {
    els = Array.from(document.querySelectorAll(selector));
  } catch {
    return [];
  }
  return els.filter((el) => matchesLabel(el, label));
}

/**
 * Marker class the engine assigns to a rule's anchored matches, so the CSS
 * pipeline can target them by a plain class. Sanitized to a CSS-safe token
 * because rule ids can include colons (seeded defaults) or UUID hyphens.
 */
export function anchorClass(ruleId: string): string {
  return `haze-anchor-${ruleId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
