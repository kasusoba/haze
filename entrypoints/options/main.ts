import { browser } from "wxt/browser";
import { COMMUNITY_SITES, type CommunitySite } from "../../lib/community-rules";
import {
  exampleRulesForSite,
  exampleSiteKey,
  isExampleSiteAdded,
} from "../../lib/rules";
import { isValidSelector } from "../../lib/selector";
import {
  addExampleRules,
  type HazeState,
  loadState,
  setGlobalEnabled,
  setUserRules,
} from "../../lib/storage";
import { type Effect, type Reveal, type Rule } from "../../lib/types";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

/** Community site ids currently expanded in the accordion (empty = all collapsed). */
const expandedSites = new Set<string>();

async function render() {
  const state = await loadState();
  renderGlobal(state);
  renderUser(state);
  renderGallery(state);
  $("version").textContent = `v${browser.runtime.getManifest().version}`;
}

function renderGlobal(state: HazeState) {
  const g = $<HTMLInputElement>("global");
  g.checked = state.globalEnabled;
  g.onchange = () => setGlobalEnabled(g.checked);
}

function renderUser(state: HazeState) {
  const root = $("user");
  root.innerHTML = "";
  const keys = Object.keys(state.userRules).sort();

  if (!keys.length) {
    root.innerHTML =
      '<p class="empty">No custom rules yet. Open any site, click the Haze toolbar icon, and pick an element.</p>';
    return;
  }

  for (const key of keys) {
    const rules = state.userRules[key] ?? [];
    const card = siteCard(key);
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
      row.append(
        enableToggle(rule.enabled, row, (on) => {
          rule.enabled = on;
          setUserRules(key, rules);
        }),
      );
      row.append(del);
      card.appendChild(row);
    }
    root.appendChild(card);
  }
}

/**
 * The examples gallery: bundled sites shown as starting points. "Add" copies a
 * site's rules into the user's own rules (where they can be edited or removed),
 * so there's no separate always-on layer.
 */
function renderGallery(state: HazeState) {
  const root = $("community");
  root.innerHTML = "";

  const toggleAll = $<HTMLButtonElement>("expand-all");
  const syncToggleAll = () => {
    const allExpanded = COMMUNITY_SITES.every((s) => expandedSites.has(s.id));
    toggleAll.textContent = allExpanded ? "Collapse all" : "Expand all";
  };
  toggleAll.onclick = () => {
    const expand = !COMMUNITY_SITES.every((s) => expandedSites.has(s.id));
    for (const s of COMMUNITY_SITES) {
      if (expand) expandedSites.add(s.id);
      else expandedSites.delete(s.id);
    }
    for (const c of root.querySelectorAll(".site")) {
      c.classList.toggle("collapsed", !expand);
    }
    syncToggleAll();
  };
  syncToggleAll();

  for (const site of COMMUNITY_SITES) {
    const added = isExampleSiteAdded(site, state);
    const card = document.createElement("div");
    card.className = expandedSites.has(site.id) ? "site" : "site collapsed";

    const head = document.createElement("div");
    head.className = "site-head";

    const toggle = el<HTMLButtonElement>("button", "site-toggle");
    toggle.type = "button";
    const caret = el<HTMLSpanElement>("span", "caret");
    caret.textContent = "▸";
    const name = el<HTMLSpanElement>("span", "name");
    name.textContent = site.id;
    const count = el<HTMLSpanElement>("span", "count");
    count.textContent = `${site.rules.length} rule${
      site.rules.length === 1 ? "" : "s"
    }`;
    toggle.append(caret, name, count);
    toggle.onclick = () => {
      if (expandedSites.has(site.id)) expandedSites.delete(site.id);
      else expandedSites.add(site.id);
      card.classList.toggle("collapsed");
      syncToggleAll();
    };

    const add = el<HTMLButtonElement>("button", "add");
    add.type = "button";
    if (added) {
      add.textContent = "Added ✓";
      add.classList.add("added");
      add.disabled = true;
    } else {
      add.textContent = "Add to my rules";
      add.title = "Copy these rules into your own rules";
      add.onclick = async () => {
        await addExampleRules(exampleSiteKey(site), exampleRulesForSite(site));
        render();
      };
    }

    head.append(toggle, add);
    card.appendChild(head);

    const body = el<HTMLDivElement>("div", "site-body");
    for (const cr of site.rules) {
      const row = el<HTMLDivElement>("div", "example-rule");
      const sel = el<HTMLSpanElement>("span", "sel");
      sel.textContent = cr.selector;
      sel.title = cr.selector;
      const tag = el<HTMLSpanElement>("span", "tag");
      tag.textContent = cr.effect;
      row.append(sel, tag);
      body.appendChild(row);
    }
    card.appendChild(body);
    root.appendChild(card);
  }
}

/** A row of editable controls bound to `rule`; `onChange` persists after edits. */
function ruleRow(rule: Rule, onChange: () => void): HTMLElement {
  const row = document.createElement("div");
  row.className = `rule${rule.enabled ? "" : " off"}`;

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

  row.append(sel);
  if (labelEl) row.append(labelEl);
  row.append(
    effect,
    intensity,
    reveal,
    checkbox("gray", rule.grayscale, (on) => {
      rule.grayscale = on;
      onChange();
    }),
  );
  return row;
}

function siteCard(title: string): HTMLElement {
  const card = document.createElement("div");
  card.className = "site";
  const head = document.createElement("div");
  head.className = "site-head";
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = title;
  head.appendChild(name);
  card.appendChild(head);
  return card;
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
