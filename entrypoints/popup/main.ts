import { browser } from "wxt/browser";
import { isBuiltinHost } from "../../lib/defaults";
import { hostKey, isInjectableUrl, originPattern } from "../../lib/host";
import {
  loadState,
  setGlobalEnabled,
  setSiteDisabled,
  setUserRules,
} from "../../lib/storage";
import type { Rule } from "../../lib/types";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function init() {
  const tab = await activeTab();
  const url = tab?.url;
  const globalInput = $<HTMLInputElement>("global");
  const siteInput = $<HTMLInputElement>("site");
  const pickBtn = $<HTMLButtonElement>("pick");
  const note = $<HTMLParagraphElement>("note");

  const state = await loadState();
  globalInput.checked = state.globalEnabled;
  globalInput.addEventListener("change", () =>
    setGlobalEnabled(globalInput.checked),
  );

  $<HTMLButtonElement>("options").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });

  if (!isInjectableUrl(url) || !tab?.id) {
    $("host").textContent = "Not available here";
    siteInput.disabled = true;
    pickBtn.disabled = true;
    note.textContent = "Haze can only run on normal web pages.";
    return;
  }

  const hostname = new URL(url).hostname;
  const key = hostKey(hostname);
  $("host").textContent = hostname;

  siteInput.checked = !state.siteDisabled[key];
  siteInput.addEventListener("change", () =>
    setSiteDisabled(key, !siteInput.checked),
  );

  const noPrompt = isBuiltinHost(hostname);
  pickBtn.addEventListener("click", () =>
    pick(tab.id as number, url, noPrompt),
  );

  await renderRules(key);
}

async function pick(tabId: number, url: string, skipPrompt: boolean) {
  const pattern = originPattern(url);
  if (!skipPrompt) {
    const has = await browser.permissions.contains({ origins: [pattern] });
    if (!has) {
      const granted = await browser.permissions.request({ origins: [pattern] });
      if (!granted) return;
    }
  }
  await browser.scripting.executeScript({
    target: { tabId },
    files: ["/picker.js"],
  });
  window.close();
}

async function renderRules(key: string) {
  const state = await loadState();
  const user = state.userRules[key] ?? [];
  const root = $("rules");
  root.innerHTML = "";

  root.appendChild(heading("Your rules", user.length));
  if (!user.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "None yet. Pick an element above to add one.";
    root.appendChild(p);
  } else {
    const ul = document.createElement("ul");
    for (const rule of user) {
      ul.appendChild(
        ruleRow(rule, {
          onToggle: async () => {
            rule.enabled = !rule.enabled;
            await setUserRules(key, user);
            await renderRules(key);
          },
          onDelete: async () => {
            await setUserRules(
              key,
              user.filter((r) => r.id !== rule.id),
            );
            await renderRules(key);
          },
        }),
      );
    }
    root.appendChild(ul);
  }
}

function heading(title: string, count: number): HTMLElement {
  const h = document.createElement("h2");
  h.textContent = title;
  const span = document.createElement("span");
  span.textContent = count ? ` ${count}` : "";
  h.appendChild(span);
  return h;
}

function ruleRow(
  rule: Rule,
  handlers: { onToggle: () => void; onDelete?: () => void },
): HTMLLIElement {
  const li = document.createElement("li");
  if (!rule.enabled) li.classList.add("off");

  const sel = document.createElement("span");
  sel.className = "sel";
  sel.textContent = rule.selector;
  sel.title = rule.selector;

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = rule.effect;

  const toggle = document.createElement("button");
  toggle.textContent = rule.enabled ? "◉" : "○";
  toggle.title = rule.enabled ? "Disable" : "Enable";
  toggle.addEventListener("click", handlers.onToggle);

  li.append(sel, tag, toggle);

  if (handlers.onDelete) {
    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "✕";
    del.title = "Remove";
    del.addEventListener("click", handlers.onDelete);
    li.append(del);
  }

  return li;
}

init();
