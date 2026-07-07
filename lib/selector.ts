// Selector generation + stability ranking for the picker. Goal: prefer stable
// anchors (data-testid, semantic ids/classes) over hashed CSS-in-JS classes so
// generated rules survive page reloads and re-renders. See docs/DESIGN.md §6.

const TEST_ATTRS = [
  "data-testid",
  "data-test",
  "data-test-id",
  "data-qa",
  "data-cy",
  "data-component",
  "itemprop",
  "name",
];

/** Heuristic: does this class look like a hashed / generated name? */
export function isHashedClass(cls: string): boolean {
  if (cls.length > 25) return true;
  // CSS-modules style: Foo__bar___aB3xY or Foo_bar_aB3
  if (/[_-][a-z0-9]{5,}$/i.test(cls) && /[A-Z0-9]/.test(cls)) return true;
  // styled-components / emotion: sc-xxxxx, css-1q2w3e
  if (/^(sc-|css-|jsx-|emotion-)/i.test(cls)) return true;
  // long digit runs are usually generated
  if (/\d{4,}/.test(cls)) return true;
  // mostly-random looking token with mixed case + digits, no separators
  if (
    cls.length >= 8 &&
    /[A-Z]/.test(cls) &&
    /\d/.test(cls) &&
    !/[-_]/.test(cls)
  )
    return true;
  return false;
}

export function isHashedId(id: string): boolean {
  if (/\d{4,}/.test(id)) return true;
  if (id.length >= 12 && /\d/.test(id) && !/[-_]/.test(id)) return true;
  if (/^(ember|react|radix|mui|:r)/i.test(id)) return true;
  return false;
}

// Transient/interaction state classes a framework toggles on the fly. Capturing
// these makes a selector match only while the element is hovered/focused/etc.,
// so the rule silently stops working afterward.
const STATE_WORDS = new Set([
  "focus",
  "focused",
  "focusing",
  "hover",
  "hovered",
  "active",
  "open",
  "opened",
  "closed",
  "selected",
  "checked",
  "disabled",
  "expanded",
  "collapsed",
  "loading",
  "dragging",
  "pressed",
  "current",
  "visible",
  "invisible",
  "show",
  "shown",
  "hide",
  "hidden",
]);

export function isStateClass(cls: string): boolean {
  const c = cls.toLowerCase();
  if (STATE_WORDS.has(c)) return true;
  if (/^(is|has|js)-/.test(c)) return true;
  if (
    /(^|-)(focus|focused|focusing|active|hover|open|selected|disabled|expanded|collapsed|loading|dragging|pressed|current)$/.test(
      c,
    )
  )
    return true;
  return false;
}

// Bare atomic-CSS/Tailwind utilities (no value suffix).
const UTILITY_WORDS = new Set([
  "flex", "grid", "block", "inline", "inline-flex", "inline-block",
  "inline-grid", "contents", "hidden", "table", "flow-root", "flex-row",
  "flex-col", "flex-row-reverse", "flex-col-reverse", "flex-wrap",
  "flex-nowrap", "flex-wrap-reverse", "grow", "shrink", "grow-0", "shrink-0",
  "flex-1", "flex-auto", "flex-initial", "flex-none", "absolute", "relative",
  "fixed", "sticky", "static", "container", "truncate", "uppercase",
  "lowercase", "capitalize", "normal-case", "italic", "not-italic",
  "underline", "overline", "line-through", "no-underline", "antialiased",
  "transform", "transform-gpu", "transform-none", "transition",
  "transition-none", "isolate", "group", "peer", "sr-only", "border",
  "rounded", "shadow", "ring", "outline", "appearance-none", "visible",
  "invisible", "collapse", "overflow-hidden", "overflow-auto",
  "overflow-visible", "overflow-scroll", "italic",
]);

// Utility roots that take a `-value` suffix (spacing, sizing, color, grid…).
const UTILITY_PREFIX =
  /^-?(?:m[trblxyse]?|p[trblxyse]?|space-[xy]|gap|gap-[xy]|w|h|min-w|max-w|min-h|max-h|size|basis|top|right|bottom|left|start|end|inset|inset-[xy]|col|row|col-span|col-start|col-end|row-span|row-start|row-end|grid-cols|grid-rows|order|text|font|leading|tracking|indent|align|whitespace|list|line-clamp|bg|from|via|to|fill|stroke|border|ring|divide|shadow|accent|caret|decoration|placeholder|outline|opacity|blur|brightness|contrast|grayscale|saturate|rounded|justify|items|self|content|place|translate|translate-x|translate-y|scale|rotate|skew|origin|duration|delay|ease|animate|z|cursor|pointer-events|select|overflow|object|aspect|columns|scroll|snap|will-change|backdrop|antialias)-/;

/**
 * Layout/style utility class (Tailwind, Tachyons, etc.)? These describe how an
 * element looks, not what it *is*, and the same utilities appear on unrelated
 * elements all over the page - so anchoring a selector on them makes it match
 * far more than the picked element. We drop them and lean on structure instead.
 */
export function isUtilityClass(cls: string): boolean {
  // A variant prefix (lg:, hover:, dark:, md:, group-hover:…) is always utility.
  if (cls.includes(":")) return true;
  const c = cls.toLowerCase();
  if (UTILITY_WORDS.has(c)) return true;
  return UTILITY_PREFIX.test(c);
}

/**
 * Classes usable as a meaningful anchor: not hashed, not transient state, and
 * not a shared layout utility. These are the ones worth putting in a selector.
 */
function semanticClasses(el: Element): string[] {
  return Array.from(el.classList).filter(
    (c) => !isHashedClass(c) && !isStateClass(c) && !isUtilityClass(c),
  );
}

export function matchCount(selector: string): number {
  try {
    return document.querySelectorAll(selector).length;
  } catch {
    return 0;
  }
}

/** Is this a syntactically valid CSS selector? (Not whether it matches anything.) */
export function isValidSelector(selector: string): boolean {
  if (!selector.trim()) return false;
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

function isUnique(selector: string): boolean {
  return matchCount(selector) === 1;
}

function nthOfType(el: Element): number {
  let n = 1;
  let sib = el.previousElementSibling;
  while (sib) {
    if (sib.tagName === el.tagName) n++;
    sib = sib.previousElementSibling;
  }
  return n;
}

function segmentFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const classes = semanticClasses(el);
  let seg = tag;
  if (classes.length) {
    seg += `.${classes.map((c) => CSS.escape(c)).join(".")}`;
  }
  return seg;
}

/**
 * Generate a reasonably stable, unique-ish CSS selector for an element.
 * Tries id, then test attributes, then a child-combinator path with stable
 * classes, adding :nth-of-type only where needed for uniqueness.
 */
export function generateSelector(el: Element): string {
  // 1. Stable, unique id.
  if (el.id && !isHashedId(el.id)) {
    const sel = `#${CSS.escape(el.id)}`;
    if (isUnique(sel)) return sel;
  }

  // 2. Stable test attribute.
  for (const attr of TEST_ATTRS) {
    const val = el.getAttribute(attr);
    if (val) {
      const sel = `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(val)}"]`;
      if (isUnique(sel)) return sel;
    }
  }

  // 3. Build a path from the element upward.
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement && cur !== document.body) {
    let seg = segmentFor(cur);

    // Disambiguate among siblings the segment can't tell apart. Test what the
    // selector actually MATCHES, not segment-string equality: a partial class
    // segment like `div.foo` still matches a sibling `div.foo.bar`, so string
    // comparison would miss it and the selector would never become unique.
    const par: Element | null = cur.parentElement;
    if (par) {
      const ambiguous = Array.from(par.children).filter((c) => {
        try {
          return c.matches(seg);
        } catch {
          return false;
        }
      });
      if (ambiguous.length > 1) seg += `:nth-of-type(${nthOfType(cur)})`;
    }

    parts.unshift(seg);
    const candidate = parts.join(" > ");
    if (isUnique(candidate)) return candidate;
    cur = par;
  }

  return parts.join(" > ");
}

/**
 * Recover the stable, human-readable local name from a CSS-modules class so a
 * generalized selector can target it via `[class*="..."]`. CSS-modules names
 * look like `HomeBanner_metaRating__M_3UA`: a readable `File_localName` head
 * plus a build hash after `__`. Only the hash changes between deploys, so the
 * head's last segment (`metaRating`) is a durable anchor. Returns null unless
 * the tell-tale `name__hash` shape is present, to avoid emitting raw hashes.
 */
export function cssModuleToken(cls: string): string | null {
  if (isStateClass(cls)) return null;
  const dbl = cls.lastIndexOf("__");
  if (dbl <= 0) return null;
  const head = cls.slice(0, dbl);
  const words = head
    .split(/[_-]+/)
    .filter((s) => /^[a-z][a-z]+$/i.test(s) && s.length >= 4);
  return words.pop() ?? null;
}

/** A `:has()` generalization matching more than this is treated as too broad. */
const HAS_GENERALIZE_MAX = 400;
/** Cap descendant scanning so picking a huge container stays responsive. */
const HAS_SCAN_LIMIT = 250;

/** tag + its classes (hashed/state always dropped; utilities optionally kept). */
function tagWithClasses(el: Element, keepUtility: boolean): string {
  const tag = el.tagName.toLowerCase();
  const cls = Array.from(el.classList).filter(
    (c) =>
      !isHashedClass(c) &&
      !isStateClass(c) &&
      (keepUtility || !isUtilityClass(c)),
  );
  return cls.length ? `${tag}.${cls.map((c) => CSS.escape(c)).join(".")}` : tag;
}

/**
 * Direct-child signatures - ideal for repeated rows of identical cells (e.g.
 * `> div.relative.h-6.w-6` for a star-rating row). Cheap, so tried first. A
 * class is required; a bare `> div` would match almost anything.
 */
function directChildPredicates(el: Element): string[] {
  const out: string[] = [];
  for (const kid of Array.from(el.children)) {
    const sig = tagWithClasses(kid, true);
    if (sig.includes(".") && !out.includes(`> ${sig}`)) out.push(`> ${sig}`);
  }
  return out;
}

/**
 * Distinctive-descendant predicates: a stable data-attribute, a semantic class,
 * or a recognizable icon color utility (fill-/stroke-/text-<color>-<n>). Uses a
 * bounded breadth-first walk so a huge subtree doesn't stall the hover preview.
 */
function descendantPredicates(el: Element): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };
  const queue = Array.from(el.children);
  let scanned = 0;
  while (queue.length && scanned < HAS_SCAN_LIMIT) {
    const d = queue.shift() as Element;
    scanned++;
    const dtag = d.tagName.toLowerCase();
    for (const attr of d.getAttributeNames()) {
      // Skip framework noise: Vue scope ids and transient headless-ui state.
      if (
        attr.startsWith("data-") &&
        !/^data-(v-|headlessui|state$|open$|reactid)/.test(attr)
      ) {
        push(`[${attr}]`);
      }
    }
    const sem = semanticClasses(d);
    if (sem.length) push(`${dtag}.${sem.map((c) => CSS.escape(c)).join(".")}`);
    for (const c of Array.from(d.classList)) {
      if (/^(fill|stroke|text)-[a-z]+-\d{2,3}$/.test(c)) {
        push(`${dtag}.${CSS.escape(c)}`);
      }
    }
    for (const c of Array.from(d.children)) queue.push(c);
  }
  return out;
}

/**
 * Try to generalize a utility-only element via `:has()`. Returns a selector
 * that matches the picked element plus its siblings (2+), but not a page-wide
 * swath, or null when no good content anchor exists. Direct-child signatures
 * are tried before the costlier descendant scan.
 */
function hasGeneralization(el: Element): string | null {
  const base = tagWithClasses(el, false); // usually just the bare tag
  const tryPreds = (preds: string[]): string | null => {
    for (const pred of preds) {
      const sel = `${base}:has(${pred})`;
      try {
        if (!el.matches(sel)) continue;
      } catch {
        continue; // :has unsupported or malformed - skip
      }
      const n = matchCount(sel);
      if (n >= 2 && n <= HAS_GENERALIZE_MAX) return sel;
    }
    return null;
  };
  return tryPreds(directChildPredicates(el)) ?? tryPreds(descendantPredicates(el));
}

/**
 * A broad, NON-unique selector that matches every element like this one - its
 * semantic classes (e.g. `.media-card-rating`), so one pick can blur a whole
 * grid. Falls back to a shared attribute, then a CSS-modules prefix match.
 *
 * When the element itself has no shared anchor - a utility-class-only element
 * on a Tailwind site, where `flex`/`col-span-4` are shared with unrelated
 * siblings - we infer a `:has()` selector from a distinctive descendant so a
 * repeated set (review star rows, cards) still generalizes with one pick. Only
 * if that fails too do we fall back to a precise single-element selector; the
 * generated selector is shown in the toolbar, so the user can always tweak it.
 */
export function generalizedSelector(el: Element): string {
  const classes = semanticClasses(el);
  if (classes.length) return classes.map((c) => `.${CSS.escape(c)}`).join("");
  for (const attr of TEST_ATTRS) {
    const val = el.getAttribute(attr);
    if (val) return `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(val)}"]`;
  }
  // CSS-in-JS: every class is hashed, but the readable prefix is stable.
  // AND the recovered tokens together so siblings sharing a generic class
  // (e.g. metaItem) but not the specific one (metaRating) are excluded.
  const tokens = [
    ...new Set(
      Array.from(el.classList)
        .map(cssModuleToken)
        .filter((t): t is string => t !== null),
    ),
  ];
  if (tokens.length) {
    return tokens.map((t) => `[class*="${CSS.escape(t)}"]`).join("");
  }
  return hasGeneralization(el) ?? generateSelector(el);
}

/** Selectors for the element and each of its ancestors (for the granularity walk). */
export function ancestorChain(el: Element): Element[] {
  const chain: Element[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement) {
    chain.push(cur);
    cur = cur.parentElement;
  }
  return chain;
}
