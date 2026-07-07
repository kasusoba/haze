import { browser } from "wxt/browser";
import { isValidSelector } from "../../lib/selector";
import {
  type HazeState,
  loadState,
  setGlobalEnabled,
  setSiteDisabled,
  setUserRules,
} from "../../lib/storage";
import { type Effect, type Reveal, type Rule } from "../../lib/types";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

/** Site host-keys whose rule card is expanded (empty = all collapsed). */
const expandedSites = new Set<string>();

async function render() {
  const state = await loadState();
  renderGlobal(state);
  renderUser(state);
  $("version").textContent = `v${browser.runtime.getManifest().version}`;
}

function renderGlobal(state: HazeState) {
  const g = $<HTMLInputElement>("global");
  g.checked = state.globalEnabled;
  g.onchange = () => setGlobalEnabled(g.checked);
}

/**
 * Your rules, grouped per site as a collapsible card with a whole-site on/off
 * switch. Expand a card to edit or remove individual rules.
 */
function renderUser(state: HazeState) {
  const root = $("user");
  root.innerHTML = "";
  const keys = Object.keys(state.userRules).sort();

  const toggleAll = $<HTMLButtonElement>("expand-all");
  const allExpanded = () =>
    keys.length > 0 && keys.every((k) => expandedSites.has(k));
  const syncToggleAll = () => {
    toggleAll.disabled = keys.length === 0;
    toggleAll.textContent = allExpanded() ? "Collapse all" : "Expand all";
  };
  toggleAll.onclick = () => {
    const expand = !allExpanded();
    for (const k of keys) {
      if (expand) expandedSites.add(k);
      else expandedSites.delete(k);
    }
    for (const c of root.querySelectorAll(".site")) {
      c.classList.toggle("collapsed", !expand);
    }
    syncToggleAll();
  };
  syncToggleAll();

  if (!keys.length) {
    root.innerHTML =
      '<p class="empty">No rules yet. Open any site, click the Haze toolbar icon, and pick an element.</p>';
    return;
  }

  for (const key of keys) {
    const rules = state.userRules[key] ?? [];
    const card = document.createElement("div");
    card.className = expandedSites.has(key) ? "site" : "site collapsed";
    if (state.siteDisabled[key]) card.classList.add("site-off");

    const head = document.createElement("div");
    head.className = "site-head";

    const toggle = el<HTMLButtonElement>("button", "site-toggle");
    toggle.type = "button";
    const name = el<HTMLSpanElement>("span", "name");
    name.textContent = key;
    const count = el<HTMLSpanElement>("span", "count");
    count.textContent = `${rules.length} rule${rules.length === 1 ? "" : "s"}`;
    toggle.append(caretIcon(), name, count);
    toggle.onclick = () => {
      if (expandedSites.has(key)) expandedSites.delete(key);
      else expandedSites.add(key);
      card.classList.toggle("collapsed");
      syncToggleAll();
    };

    head.append(
      toggle,
      switchEl(!state.siteDisabled[key], (on) => {
        setSiteDisabled(key, !on);
        card.classList.toggle("site-off", !on);
      }),
    );
    card.appendChild(head);

    const body = el<HTMLDivElement>("div", "site-body");
    for (const rule of rules) {
      const row = ruleRow(rule, () => setUserRules(key, rules));
      const del = el<HTMLButtonElement>("button", "del");
      del.type = "button";
      del.textContent = "✕";
      del.title = "Remove";
      del.onclick = async () => {
        await setUserRules(
          key,
          rules.filter((r) => r.id !== rule.id),
        );
        render();
      };
      // Row-level actions, pinned top-right so ✕ never wraps away.
      const actions = el<HTMLDivElement>("div", "rule-actions");
      actions.append(
        enableToggle(rule.enabled, row, (on) => {
          rule.enabled = on;
          setUserRules(key, rules);
        }),
        del,
      );
      row.append(actions);
      body.appendChild(row);
    }
    card.appendChild(body);
    root.appendChild(card);
  }
}

/** Heroicons mini chevron-right; CSS rotates it when the card is expanded. */
function caretIcon(): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "caret");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("fill-rule", "evenodd");
  path.setAttribute("clip-rule", "evenodd");
  path.setAttribute(
    "d",
    "M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z",
  );
  svg.appendChild(path);
  return svg;
}

/**
 * A row of editable controls bound to `rule`; `onChange` persists after edits.
 * The fields (selector, label, effect…) live in a `.rule-fields` zone that
 * wraps freely; the caller appends row-level actions (on/delete) after it, and
 * CSS pins those to the top-right so they never wrap away.
 */
function ruleRow(rule: Rule, onChange: () => void): HTMLElement {
  const row = document.createElement("div");
  row.className = `rule${rule.enabled ? "" : " off"}`;
  const fields = el<HTMLDivElement>("div", "rule-fields");

  const sel = el<HTMLInputElement>("input", "sel");
  sel.value = rule.selector;
  sel.spellcheck = false;
  const markValid = () =>
    sel.classList.toggle("invalid", !isValidSelector(sel.value.trim()));
  markValid();
  sel.oninput = markValid;
  sel.onchange = () => {
    rule.selector = sel.value.trim();
    markValid();
    onChange();
  };

  // Label anchor (lib/anchor.ts): only shown for rules that already have one,
  // since anchors are created via the picker. Clearing it reverts to plain CSS.
  let labelEl: HTMLInputElement | null = null;
  if (rule.label !== undefined) {
    labelEl = el<HTMLInputElement>("input", "label");
    labelEl.value = rule.label;
    labelEl.spellcheck = false;
    labelEl.placeholder = "label";
    labelEl.title = "Matches only values under this label";
    labelEl.onchange = () => {
      rule.label = labelEl?.value.trim() || undefined;
      onChange();
    };
  }

  const effect = select(["blur", "scratchcard", "both"], rule.effect, (v) => {
    rule.effect = v as Effect;
    onChange();
  });

  const intensity = el<HTMLInputElement>("input", "num");
  intensity.type = "number";
  intensity.min = "0";
  intensity.value = String(rule.intensity);
  intensity.title = "Blur radius (px)";
  intensity.onchange = () => {
    rule.intensity = Number(intensity.value) || 0;
    onChange();
  };

  const reveal = select(["hover", "click"], rule.reveal, (v) => {
    rule.reveal = v as Reveal;
    onChange();
  });

  fields.append(sel);
  if (labelEl) fields.append(labelEl);
  fields.append(
    effect,
    intensity,
    reveal,
    checkbox("gray", rule.grayscale, (on) => {
      rule.grayscale = on;
      onChange();
    }),
  );
  row.append(fields);
  return row;
}

/** A pill on/off switch (whole-site enable). */
function switchEl(
  checked: boolean,
  onChange: (on: boolean) => void,
): HTMLLabelElement {
  const label = el<HTMLLabelElement>("label", "switch");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.onchange = () => onChange(input.checked);
  const slider = el<HTMLSpanElement>("span", "slider");
  label.append(input, slider);
  return label;
}

function enableToggle(
  on: boolean,
  row: HTMLElement,
  onChange: (on: boolean) => void,
): HTMLElement {
  return checkbox("on", on, (value) => {
    row.classList.toggle("off", !value);
    onChange(value);
  });
}

// --- export / import ---

async function exportRules() {
  const state = await loadState();
  const payload = {
    haze: true,
    version: 1,
    userRules: state.userRules,
    siteDisabled: state.siteDisabled,
    globalEnabled: state.globalEnabled,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "haze-rules.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function importRules(file: File) {
  const text = await file.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    alert("Invalid JSON file.");
    return;
  }
  if (data?.haze !== true) {
    alert("Not a Haze export file.");
    return;
  }
  await browser.storage.sync.set({
    userRules: data.userRules ?? {},
    siteDisabled: data.siteDisabled ?? {},
    ...(typeof data.globalEnabled === "boolean"
      ? { globalEnabled: data.globalEnabled }
      : {}),
  });
  render();
}

// --- small DOM helpers ---

function el<T extends HTMLElement>(tag: string, className: string): T {
  const node = document.createElement(tag) as T;
  node.className = className;
  return node;
}

function select(
  options: string[],
  value: string,
  onChange: (v: string) => void,
): HTMLSelectElement {
  const s = document.createElement("select");
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    if (opt === value) o.selected = true;
    s.appendChild(o);
  }
  s.onchange = () => onChange(s.value);
  return s;
}

function checkbox(
  label: string,
  checked: boolean,
  onChange: (on: boolean) => void,
): HTMLLabelElement {
  const wrap = el<HTMLLabelElement>("label", "cb");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.onchange = () => onChange(input.checked);
  wrap.append(input, document.createTextNode(label));
  return wrap;
}

$("export").addEventListener("click", exportRules);
$("import").addEventListener("click", () =>
  $<HTMLInputElement>("file").click(),
);
$<HTMLInputElement>("file").addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) importRules(file);
});

render();
