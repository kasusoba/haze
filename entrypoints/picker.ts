import { browser } from "wxt/browser";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
// Shared control/token styles, injected into the picker's shadow root so its
// selects/checkboxes/color swatch match the popup and options editors exactly.
import hazeShared from "../components/haze-ui.css?inline";
import { anchorMatches, labelOf } from "../lib/anchor";
import { generateCss, PREVIEW_CLASS } from "../lib/css";
import type { CreateRuleMessage, CreateRuleResponse } from "../lib/messages";
import {
  generalizedSelector,
  generateSelector,
  matchCount,
} from "../lib/selector";
import { unwrapTextMatches, wrapTextMatches } from "../lib/text";
import {
  DEFAULT_BG,
  DEFAULT_INTENSITY,
  type Effect,
  type Reveal,
  type Rule,
} from "../lib/types";

// Self-contained element picker. Injected via scripting.executeScript from the
// popup (under activeTab) so it works before any persistent permission exists.
export default defineUnlistedScript(() => {
  const w = window as unknown as Record<string, boolean>;
  if (w.__hazePicker) return;
  w.__hazePicker = true;
  startPicker(() => {
    w.__hazePicker = false;
  });
});

function startPicker(onClose: () => void): void {
  // Two-phase: hover to preview, click to lock. Once locked, the selection is
  // frozen so the user can move to the toolbar and widen/tighten without the
  // mouse re-picking. Clicking another element re-locks.
  type TextToken = { node: Text; start: number; end: number; numeric: boolean };

  let base: Element | null = null;
  let depth = 0;
  let locked = false;
  let textPick = false;
  let pendingToken: TextToken | null = null;
  let previewBeforePick = true;
  let current: Element | null = null;

  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  // Live preview: a separate stylesheet gated on PREVIEW_CLASS so it never
  // touches the real engine state. Removed on cancel (revert) or create.
  const previewStyle = document.createElement("style");
  document.documentElement.appendChild(previewStyle);

  root.innerHTML = `
    <style>${hazeShared}</style>
    <style>
      :host { all: initial; }
      .box {
        position: fixed; pointer-events: none; z-index: 1;
        border: 2px dashed #f0a23c; background: rgba(240,162,60,0.14);
        border-radius: 3px; transition: all .05s ease-out;
      }
      .box.locked { border-style: solid; background: rgba(240,162,60,0.22); }
      .tbox {
        position: fixed; pointer-events: none; z-index: 1; display: none;
        background: rgba(77,181,255,0.28); outline: 1px solid #4db5ff;
        border-radius: 2px;
      }
      .bar {
        position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
        z-index: 2; display: flex; flex-direction: column; gap: 8px;
        background: #1a1a18; color: #eceae6; padding: 10px 12px;
        border: 1px solid #2e2d2a; border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,.55);
        font: 13px/1.4 system-ui, sans-serif; width: min(660px, 92vw);
      }
      .bar .row { display: flex; align-items: center; gap: 8px; }
      .bar .row.controls { flex-wrap: wrap; }
      .bar .spacer { flex: 1; }
      .bar .sep { width: 1px; height: 20px; background: #2e2d2a; }
      .bar input.sel {
        font: 12px/1.3 ui-monospace, monospace; background: #121211;
        color: #cabfae; border: 1px solid #2e2d2a; border-radius: 6px;
        padding: 6px 8px; flex: 1; min-width: 0;
      }
      .bar .iconbtn {
        width: 30px; height: 28px; padding: 0;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .bar .count { color: #918d85; white-space: nowrap; }
      .bar button {
        border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer;
        font: 600 12px system-ui; color: #eceae6; background: #26251f;
      }
      .bar button:disabled { opacity: .4; cursor: not-allowed; }
      .bar button.go { background: #f0a23c; color: #2a1c08; }
      /* Effect/reveal/scope selects, the color swatch, and the Gray/Preview/
         anchor checkboxes use the shared .ctl/.color/.cb classes from the
         injected haze-ui stylesheet; only their bar-local layout stays here. */
      .bar .cb { white-space: nowrap; font-size: 12px; }
      .bar .hint { color: #9b9183; width: 100%; font-size: 11px; }
    </style>
    <div class="box" id="box"></div>
    <div class="tbox" id="tbox"></div>
    <div class="bar haze-root">
      <div class="row">
        <input class="sel" id="sel" spellcheck="false" placeholder="click an element to start…" />
        <span class="count" id="count"></span>
        <button class="iconbtn" id="up" title="Broaden - select parent (↑)" disabled>▲</button>
        <button class="iconbtn" id="down" title="Narrow - select child (↓)" disabled>▼</button>
      </div>
      <div class="row">
        <input class="sel" id="text" spellcheck="false" placeholder="optional: redact only part of the element - click 'Pick text', then click the text" />
        <button id="picktext" title="Click the exact text to redact; a pattern is derived for you" disabled>Pick text</button>
      </div>
      <div class="row" id="anchorrow" style="display:none">
        <label class="cb"><input type="checkbox" id="anchor" /> Match by label</label>
        <input class="sel" id="label" spellcheck="false" placeholder="label text - matches only values under this label" />
      </div>
      <div class="row controls">
        <select id="scope" class="ctl" title="How many elements to match">
          <option value="similar">All similar</option>
          <option value="one">This one</option>
        </select>
        <select id="effect" class="ctl" title="Effect">
          <option value="blur">Blur</option>
          <option value="scratchcard">Scratchcard</option>
          <option value="hide">Hide</option>
        </select>
        <input type="color" id="bg" class="color" value="#888888" title="Scratchcard color" style="display:none" />
        <select id="reveal" class="ctl" title="Reveal on">
          <option value="hover">Hover</option>
          <option value="click">Click</option>
        </select>
        <label class="cb"><input type="checkbox" id="gray" /> Gray</label>
        <label class="cb"><input type="checkbox" id="preview" checked /> Preview</label>
        <span class="spacer"></span>
        <button id="repick" title="Repick - back to hovering (Esc)" disabled>Repick</button>
        <button class="go" id="create" disabled>Create</button>
        <button id="cancel">Cancel</button>
      </div>
    </div>`;

  // Preview wrappers use a class distinct from the engine's TEXT_CLASS so the
  // picker never clobbers spans the live engine created for stored rules.
  const PREVIEW_TEXT_CLASS = "haze-preview-text";
  // Marker for label-anchored matches in the live preview (engine-independent).
  const PREVIEW_ANCHOR_CLASS = "haze-preview-anchor";

  const box = root.getElementById("box") as HTMLDivElement;
  const tbox = root.getElementById("tbox") as HTMLDivElement;
  const selInput = root.getElementById("sel") as HTMLInputElement;
  const textInput = root.getElementById("text") as HTMLInputElement;
  const countEl = root.getElementById("count") as HTMLSpanElement;
  const effectSel = root.getElementById("effect") as HTMLSelectElement;
  const revealSel = root.getElementById("reveal") as HTMLSelectElement;
  const scopeSel = root.getElementById("scope") as HTMLSelectElement;
  const grayCb = root.getElementById("gray") as HTMLInputElement;
  const bgInput = root.getElementById("bg") as HTMLInputElement;
  const previewCb = root.getElementById("preview") as HTMLInputElement;
  const upBtn = root.getElementById("up") as HTMLButtonElement;
  const downBtn = root.getElementById("down") as HTMLButtonElement;
  const createBtn = root.getElementById("create") as HTMLButtonElement;
  const repickBtn = root.getElementById("repick") as HTMLButtonElement;
  const pickTextBtn = root.getElementById("picktext") as HTMLButtonElement;
  const anchorRow = root.getElementById("anchorrow") as HTMLDivElement;
  const anchorCb = root.getElementById("anchor") as HTMLInputElement;
  const labelInput = root.getElementById("label") as HTMLInputElement;

  function resolveCurrent(): Element | null {
    let el: Element | null = base;
    for (let i = 0; i < depth && el; i++) el = el.parentElement;
    return el;
  }

  // Replaced/embedded elements that render their own content (vs. layout boxes).
  const CONTENT_TAGS = new Set([
    "IMG",
    "VIDEO",
    "CANVAS",
    "SVG",
    "PICTURE",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "INPUT",
    "TEXTAREA",
    "SELECT",
    "AUDIO",
  ]);

  // Does this element render something itself, rather than being a bare box?
  // Used to favor real targets over equally-sized empty overlays/containers.
  function isContentful(el: Element): boolean {
    if (CONTENT_TAGS.has(el.tagName.toUpperCase())) return true;
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? "").trim())
        return true;
    }
    return getComputedStyle(el).backgroundImage !== "none";
  }

  // Hit-test through the whole z-stack, not just the topmost element. Full-size
  // hover overlays / click-catchers (common in card UIs) otherwise mask the
  // specific thing beneath them, so the picker would only ever see the overlay.
  // Prefer content-bearing elements over empty boxes, then the smallest box:
  // the rating badge wins over the scrim, while a poster image still wins over
  // its equally-sized transparent container.
  function pickAt(x: number, y: number): Element | null {
    const stack = (document.elementsFromPoint(x, y) as Element[]).filter(
      (el) => el !== host && !host.contains(el),
    );
    let best: Element | null = null;
    let bestContent = false;
    let bestArea = Number.POSITIVE_INFINITY;
    for (const el of stack) {
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area <= 0) continue;
      const content = isContentful(el);
      // Content beats non-content; within the same class, smaller box wins.
      const better =
        best === null ||
        (content && !bestContent) ||
        (content === bestContent && area < bestArea);
      if (better) {
        best = el;
        bestContent = content;
        bestArea = area;
      }
    }
    return best;
  }

  // Highlight boxes are position:fixed (viewport coords), so any scroll or
  // resize leaves them stranded until we re-read the element's rect. Kept
  // separate from refresh() so scroll handling stays geometry-only (cheap).
  function positionBoxes(): void {
    if (current) {
      const rect = current.getBoundingClientRect();
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    }
    if (pendingToken) {
      const range = document.createRange();
      range.setStart(pendingToken.node, pendingToken.start);
      range.setEnd(pendingToken.node, pendingToken.end);
      const r = range.getBoundingClientRect();
      tbox.style.left = `${r.left}px`;
      tbox.style.top = `${r.top}px`;
      tbox.style.width = `${r.width}px`;
      tbox.style.height = `${r.height}px`;
    }
  }

  function refresh(): void {
    current = resolveCurrent();
    box.classList.toggle("locked", locked);
    if (!current) return;
    positionBoxes();
    const selector =
      scopeSel.value === "similar"
        ? generalizedSelector(current)
        : generateSelector(current);
    selInput.value = selector;
    syncAnchorUI();
    updateCount();
    updatePreview();
  }

  // The label to anchor by right now, or null when anchoring is off/blank.
  function activeLabel(): string | null {
    if (!anchorCb.checked) return null;
    return labelInput.value.trim() || null;
  }

  // Anchoring narrows a broad "all similar" set by label; it's meaningless on a
  // unique "this one" selector, so scope is pinned to similar while it's on.
  function syncAnchorScope(): void {
    if (anchorCb.checked) {
      scopeSel.value = "similar";
      scopeSel.disabled = true;
    } else {
      scopeSel.disabled = false;
    }
  }

  // Offer the "match by label" control only when the current element sits in a
  // `Label: value` row; prefill the detected label until the user commits.
  function syncAnchorUI(): void {
    const detected = current ? labelOf(current) : null;
    if (detected) {
      anchorRow.style.display = "";
      anchorCb.disabled = false;
      if (!anchorCb.checked) labelInput.value = detected;
    } else {
      anchorRow.style.display = "none";
      anchorCb.checked = false;
      anchorCb.disabled = true;
      labelInput.value = "";
    }
    syncAnchorScope();
  }

  function currentRule(): Rule {
    return {
      id: "preview",
      selector: selInput.value.trim(),
      effect: effectSel.value as Effect,
      intensity: DEFAULT_INTENSITY,
      grayscale: grayCb.checked,
      reveal: revealSel.value as Reveal,
      bg: bgInput.value,
      text: textInput.value.trim() || undefined,
      label: activeLabel() ?? undefined,
      enabled: true,
    };
  }

  function clearPreviewAnchor(): void {
    for (const el of document.querySelectorAll(`.${PREVIEW_ANCHOR_CLASS}`))
      el.classList.remove(PREVIEW_ANCHOR_CLASS);
  }

  function updatePreview(): void {
    // Rewrap each time so changing the regex/selector re-targets cleanly.
    unwrapTextMatches(PREVIEW_TEXT_CLASS);
    clearPreviewAnchor();
    const rule = currentRule();
    const on = locked && previewCb.checked && rule.selector !== "";
    if (on) {
      // Anchored rules can't be expressed in CSS, so tag the JS-resolved
      // matches with a marker class and preview against that instead.
      let sel = rule.selector;
      if (rule.label) {
        for (const el of anchorMatches(rule.selector, rule.label))
          el.classList.add(PREVIEW_ANCHOR_CLASS);
        sel = `.${PREVIEW_ANCHOR_CLASS}`;
      }
      const effRule = { ...rule, selector: sel };
      if (effRule.text) wrapTextMatches(sel, effRule.text, PREVIEW_TEXT_CLASS);
      previewStyle.textContent = generateCss(
        [effRule],
        DEFAULT_BG,
        PREVIEW_CLASS,
        PREVIEW_TEXT_CLASS,
      );
      document.documentElement.classList.add(PREVIEW_CLASS);
    } else {
      previewStyle.textContent = "";
      document.documentElement.classList.remove(PREVIEW_CLASS);
    }
  }

  // Hide removes the element outright, so reveal-on and grayscale don't apply;
  // the scratchcard color only matters for the scratchcard effect.
  function syncEffectUI(): void {
    const hidden = effectSel.value === "hide";
    revealSel.disabled = hidden;
    grayCb.disabled = hidden;
    bgInput.style.display =
      effectSel.value === "scratchcard" ? "inline-block" : "none";
  }

  function setLocked(value: boolean): void {
    locked = value;
    upBtn.disabled = !value;
    downBtn.disabled = !value;
    createBtn.disabled = !value;
    repickBtn.disabled = !value;
    pickTextBtn.disabled = !value;
  }

  // "Pick text": point at the exact text to redact and click it. Uses caret
  // hit-testing rather than native selection (which sites routinely disable via
  // user-select), then derives a generalized, context-anchored regex.
  interface CaretDoc {
    caretPositionFromPoint?(
      x: number,
      y: number,
    ): { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?(x: number, y: number): Range | null;
  }

  /** The text run under a point: a number (incl. , . separators) or a word. */
  function caretToken(x: number, y: number): TextToken | null {
    const doc = document as Document & CaretDoc;
    let node: Node | null = null;
    let offset = 0;
    if (doc.caretPositionFromPoint) {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos) {
        node = pos.offsetNode;
        offset = pos.offset;
      }
    } else if (doc.caretRangeFromPoint) {
      const r = doc.caretRangeFromPoint(x, y);
      if (r) {
        node = r.startContainer;
        offset = r.startOffset;
      }
    }
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const text = node.nodeValue ?? "";
    const len = text.length;
    const i = Math.max(0, Math.min(offset, len));
    const at = (k: number) => text[k] ?? "";
    const isDigit = (k: number) => k >= 0 && k < len && /[0-9]/.test(at(k));
    const numeric = isDigit(i) || isDigit(i - 1);
    const inTok = numeric
      ? (c: string) => /[0-9.,]/.test(c)
      : (c: string) => /\S/.test(c) && c !== "•";
    let start = i;
    let end = i;
    while (start > 0 && inTok(at(start - 1))) start--;
    while (end < len && inTok(at(end))) end++;
    // Trim separators that ended up on the edges of a number (e.g. "3.5,").
    if (numeric) {
      while (end > start && /[.,]/.test(at(end - 1))) end--;
      while (start < end && /[.,]/.test(at(start))) start++;
    }
    if (end <= start) return null;
    return { node: node as Text, start, end, numeric };
  }

  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function derivePattern(tok: TextToken): string | null {
    const text = tok.node.nodeValue ?? "";
    const token = text.slice(tok.start, tok.end);
    if (!token) return null;
    // Numbers generalize so sibling rows (other ratings/counts) match too;
    // words match literally. Both stay user-editable in the field.
    const core = tok.numeric ? "[0-9][0-9.,]*" : escapeRe(token);
    // Anchor by what immediately follows the pick, so a look-alike number
    // elsewhere on the line (e.g. a publish year vs a page count) is spared.
    const after = text.slice(tok.end);
    if (/^\s*$/.test(after)) return `${core}(?=\\s*$)`;
    const m = after.match(/^\s*([^\s0-9][^\s]*)/);
    if (m?.[1]) return `${core}(?=\\s*${escapeRe(m[1])})`;
    return core;
  }

  function previewTextToken(e: MouseEvent): void {
    if (!current) return;
    const tok = caretToken(e.clientX, e.clientY);
    if (!tok || !current.contains(tok.node)) {
      pendingToken = null;
      tbox.style.display = "none";
      return;
    }
    pendingToken = tok;
    tbox.style.display = "block";
    positionBoxes();
  }

  function finalizeTextToken(): void {
    const tok = pendingToken;
    exitTextPick();
    if (!tok) return;
    const pattern = derivePattern(tok);
    if (!pattern) return;
    textInput.value = pattern;
    previewCb.checked = true; // now reveal the result
    updatePreview();
  }

  function enterTextPick(): void {
    if (!locked || textPick) return;
    textPick = true;
    pickTextBtn.textContent = "Click the text…";
    // The blur preview makes text unreadable, so suppress it while picking.
    previewBeforePick = previewCb.checked;
    previewCb.checked = false;
    previewCb.disabled = true;
    updatePreview();
  }

  function exitTextPick(): void {
    if (!textPick) return;
    textPick = false;
    pickTextBtn.textContent = "Pick text";
    tbox.style.display = "none";
    pendingToken = null;
    previewCb.disabled = false;
    previewCb.checked = previewBeforePick;
    updatePreview();
  }

  // Drop back to hovering without tearing the picker down, so a mis-pick can be
  // corrected in place. Starting over also clears any text pattern.
  function unlock(): void {
    if (!locked) return;
    exitTextPick();
    textInput.value = "";
    setLocked(false);
    box.classList.remove("locked");
    updatePreview(); // clears the preview since it's gated on `locked`
  }

  function updateCount(): void {
    const selector = selInput.value.trim();
    const label = activeLabel();
    const n = label
      ? anchorMatches(selector, label).length
      : matchCount(selector);
    countEl.textContent = `${n} match${n === 1 ? "" : "es"}`;
  }

  function onMove(e: MouseEvent): void {
    if (textPick) {
      previewTextToken(e);
      return;
    }
    if (locked) return;
    const el = pickAt(e.clientX, e.clientY);
    if (!el) return;
    base = el;
    depth = 0;
    refresh();
  }

  function onClick(e: MouseEvent): void {
    // Let toolbar clicks through to their own handlers.
    if (e.target === host || host.contains(e.target as Node)) return;
    // Always swallow the page click (stops link navigation while picking).
    e.preventDefault();
    e.stopPropagation();
    // While picking text, this click commits the token under the cursor.
    if (textPick) {
      finalizeTextToken();
      return;
    }
    const el = pickAt(e.clientX, e.clientY);
    if (!el) return;
    base = el;
    depth = 0;
    anchorCb.checked = false; // each fresh pick starts unanchored
    setLocked(true);
    refresh();
  }

  function widen(): void {
    if (!locked) return;
    depth++;
    refresh();
  }
  function tighten(): void {
    if (!locked || depth === 0) return;
    depth--;
    refresh();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      // Escape backs out one step: text-pick → locked → hovering → closed.
      if (textPick) exitTextPick();
      else if (locked) unlock();
      else teardown();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      widen();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      tighten();
    } else if (e.key === "Enter" && locked) {
      e.preventDefault();
      create();
    }
  }

  async function create(): Promise<void> {
    const selector = selInput.value.trim();
    if (!selector) return;
    const msg: CreateRuleMessage = {
      type: "haze:create-rule",
      selector,
      effect: effectSel.value as Effect,
      reveal: revealSel.value as Reveal,
      intensity: DEFAULT_INTENSITY,
      grayscale: grayCb.checked,
      bg: bgInput.value,
      text: textInput.value.trim() || undefined,
      label: activeLabel() ?? undefined,
    };
    teardown();
    try {
      const res = (await browser.runtime.sendMessage(msg)) as
        | CreateRuleResponse
        | undefined;
      toast(res?.ok ? "Rule added ✓" : `Failed: ${res?.error ?? "unknown"}`);
    } catch (err) {
      toast(`Failed: ${String(err)}`);
    }
  }

  function toast(text: string): void {
    const t = document.createElement("div");
    t.textContent = text;
    t.style.cssText =
      "all:initial;position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1a1a18;color:#eceae6;font:600 13px system-ui;padding:10px 16px;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.5);border:1px solid #2e2d2a;";
    document.documentElement.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  function teardown(): void {
    exitTextPick();
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("click", onClick, true);
    window.removeEventListener("scroll", positionBoxes, true);
    window.removeEventListener("resize", positionBoxes);
    document.documentElement.classList.remove(PREVIEW_CLASS);
    unwrapTextMatches(PREVIEW_TEXT_CLASS);
    clearPreviewAnchor();
    previewStyle.remove();
    host.remove();
    onClose();
  }

  upBtn.addEventListener("click", widen);
  downBtn.addEventListener("click", tighten);
  createBtn.addEventListener("click", create);
  repickBtn.addEventListener("click", unlock);
  pickTextBtn.addEventListener("click", enterTextPick);
  scopeSel.addEventListener("change", refresh);
  effectSel.addEventListener("change", () => {
    syncEffectUI();
    updatePreview();
  });
  revealSel.addEventListener("change", updatePreview);
  grayCb.addEventListener("change", updatePreview);
  bgInput.addEventListener("input", updatePreview);
  previewCb.addEventListener("change", updatePreview);
  anchorCb.addEventListener("change", () => {
    syncAnchorScope();
    refresh();
  });
  labelInput.addEventListener("input", () => {
    updateCount();
    updatePreview();
  });
  root.getElementById("cancel")?.addEventListener("click", teardown);
  selInput.addEventListener("input", () => {
    updateCount();
    updatePreview();
  });
  textInput.addEventListener("input", updatePreview);

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("click", onClick, true);
  // Capture so scrolls inside nested containers (which don't bubble) still
  // keep the highlight glued to its element.
  window.addEventListener("scroll", positionBoxes, true);
  window.addEventListener("resize", positionBoxes);
}
