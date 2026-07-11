# Design: Haze concealment engine

How Haze works under the hood. Haze lets you pick any element on any site and
blur, scratchcard, or hide it, toggle it on and off, and (for blur/scratchcard)
reveal it on interaction. The build lives in `entrypoints/` + `lib/`
(WXT + TypeScript + Biome).

---

## 1. Overview

Haze is a generic "conceal anything, reveal on demand" tool. There are no
hardcoded per-site stylesheets; instead the user creates **rules** with the
element picker, and a small engine materializes them as CSS on matching pages.

The moving parts:

- **`lib/`** - framework-agnostic logic: the data model, CSS generation,
  selector generation, containment, text redaction, label anchoring, storage.
- **`entrypoints/engine.content.ts`** - the content script that applies rules to
  a page (CSS injection + a MutationObserver for the dynamic cases).
- **`entrypoints/picker.ts`** - the injected element picker (a self-contained
  shadow-DOM UI).
- **`entrypoints/popup/`** and **`entrypoints/options/`** - the toolbar popup and
  the full options page for managing rules.
- **`entrypoints/background.ts`** - install/seed/migrate hooks and dynamic
  content-script registration for user-granted origins.

---

## 2. Data model

A rule (`lib/types.ts`):

```ts
interface Rule {
  id: string;
  selector: string;      // CSS selector; may be a comma-separated group
  effect: "blur" | "scratchcard" | "hide";
  intensity: number;     // blur radius in px
  grayscale: boolean;    // also desaturate (useful for color-coded indicators)
  reveal: "hover" | "click";
  bg?: string;           // scratchcard overlay color; falls back to a default
  text?: string;         // optional regex: redact only matching substrings
  label?: string;        // optional "Label: value" row anchor
  enabled: boolean;
}
```

### Effects
- **`blur`** - a Gaussian `filter: blur()`; peek by revealing.
- **`scratchcard`** - blur *plus* an opaque `::after` cover; peek by revealing.
- **`hide`** - `display: none`; removed from the page, no reveal.

Reveal, grayscale, and blur radius only apply to `blur`/`scratchcard`; `hide`
ignores them.

> A pre-2.4 build offered a scratchcard-*only* effect and a `both` (blur + card)
> effect. Both now collapse to `scratchcard` (blur + card). `normalizeEffect()`
> in `lib/types.ts` coerces legacy values, and `background.ts` migrates stored
> rules once on update.

### Storage (`browser.storage.sync`)
```jsonc
{
  "globalEnabled": true,
  "siteDisabled": { "example.com": true },   // hostKey -> explicitly off
  "userRules": {                              // hostKey -> the user's rules
    "google.com": [
      { "selector": "g-review-stars, ...", "effect": "blur",
        "intensity": 15, "reveal": "hover", "enabled": true }
    ]
  }
}
```

Rules are keyed by a normalized `hostKey` (see `lib/host.ts`). Granted custom
origins are tracked separately in `storage.local` and re-registered on startup.

---

## 3. The concealment engine

### 3.1 Hybrid CSS + JS (no FOUC, still handles dynamic DOM)

Two needs pull in opposite directions:

| Approach | Dynamic DOM (SPA) | Nesting dedupe | Flash before JS |
|---|---|---|---|
| Inject a generated `<style>` from selectors | free | impossible in pure CSS | none |
| JS class-tagging + MutationObserver | needs observer | full control | flashes |

Haze does **both**:

1. At `document_start`, inject a `<style>` built from all active selectors for
   the host. This blurs instantly with **no flash of unconcealed content**, and
   auto-applies to elements added later with zero JS.
2. A debounced **MutationObserver** handles only the cases CSS can't: containment
   dedupe, text-redaction wrapping, and label-anchor tagging.

The global/site toggle is a single class flip on `<html>` (`haze-active`), so
turning everything on or off never rebuilds the stylesheet.

### 3.2 Containment: outermost-wins

`filter: blur()` on an ancestor already blurs its whole subtree. If one rule
blurs ancestor `A` and another blurs descendant `D` inside it:

- `D` is **double-blurred** (filters compound), and
- **reveal breaks both ways** - hovering `A` clears `A` but `D` keeps its own
  filter, and hovering `D` can't clear because `A` still filters it.

So nesting silently kills the signature feature. **One effect per visual region
is mandatory.** The engine computes effective targets = matched elements with no
other matched element as an ancestor; inner matches get a `haze-suppressed`
class whose CSS cancels the blur and the scratchcard overlay. The rule stays
stored, it's just not materialized on the inner element. This is resolved in JS
because pure CSS can't express "has no matched ancestor."

### 3.3 Text redaction and label anchors

Two refinements let a rule target something smaller or more specific than a whole
element:

- **Text redaction (`lib/text.ts`)** - when a rule has a `text` regex, the engine
  wraps only the matching substrings inside the matched element in spans and
  applies the effect to those, rather than the whole element. This handles a
  rating that lives as a bare text node in a larger line.
- **Label anchors (`lib/anchor.ts`)** - when a rule has a `label`, it matches only
  those `selector` elements immediately preceded by that label (the
  `Label: value` row shape). This is the reliable way to target one field on
  sites where every value shares the same classes. It's resolved in JS and
  exposed to the CSS pipeline via a per-rule marker class.

---

## 4. The picker

An uBlock-style element picker (`entrypoints/picker.ts`), injected via
`scripting.executeScript` under `activeTab` so it works before any persistent
permission exists.

- **Hit-testing** walks the full z-stack (not just the topmost element) so
  full-size hover overlays and click-catchers don't mask the real target;
  content-bearing elements win over empty boxes, then the smallest box wins.
- **Two-phase**: hover to preview, click to lock. Once locked, the selection is
  frozen so you can move to the toolbar and widen/tighten (up/down the DOM tree)
  without the mouse re-picking.
- **Selector generation (`lib/selector.ts`)** prefers stable anchors
  (`data-testid`, `id`, semantic attributes) over hashed CSS-in-JS classes, and
  can generalize to "all similar" elements or pin to "this one."
- **Live preview** renders the pending rule against a separate gate class
  (`haze-preview`) so it never touches real engine state.
- Creating a rule sends it to the background, which stores it and (for
  non-builtin sites) registers a persistent content script for that origin.

Selector brittleness is the biggest long-term cost: sites use hashed classes, so
stability ranking in the picker is what makes rules survive site updates.

---

## 5. Permissions

- **Google Search** ships as a static `host_permission` so the one built-in rule
  works at install with a modest prompt.
- **Everything else** uses **optional host permissions**, requested per-site the
  first time you pick an element there (a clear user gesture), then persisted by
  registering a dynamic content script for that origin. No broad `<all_urls>`
  prompt at install; friendlier and easier to review.

WXT generates the manifest from `wxt.config.ts`.

---

## 6. Default rule and migration

Haze seeds exactly one rule on first run (`lib/defaults.ts`): blur Google
Search's review stars and ratings. It's seeded into the user's own rules (not a
separate layer), so it's editable and deletable like anything they create; a
`defaultsSeeded` flag makes a later deletion stick.

On update, `background.ts` runs one-time migrations: mapping legacy per-site
toggle keys to the new `hostKey` scheme, and folding legacy effect values
(scratchcard-only, `both`) into the current set.

---

## 7. Stack and performance notes

- **WXT** generates the manifest, gives HMR for content scripts, and produces
  Chrome + Firefox builds.
- **TypeScript** carries the data model and the picker <-> background messaging.
- **Preact** powers the UI. The popup and options page share a `RuleCard` /
  `RuleEditor` component set (`components/`) so the two surfaces are identical;
  the picker stays vanilla (its live-page interaction model doesn't fit a
  declarative rewrite) but injects the same shared stylesheet into its shadow
  root so its controls match. The engine and `lib/*` are deliberately vanilla.
- **Biome** for lint/format.
- **Performance**: the observer is debounced, containment queries are scoped, and
  everything short-circuits when the global toggle is off. CSS injects at
  `document_start` to avoid FOUC.
