import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { browser } from "wxt/browser";
import { Switch } from "../../components/controls";
import { RuleCard } from "../../components/RuleCard";
import type { RulePatch } from "../../components/RuleEditor";
import { isBuiltinHost } from "../../lib/defaults";
import { hostKey, isInjectableUrl, originPattern } from "../../lib/host";
import {
  loadState,
  setGlobalEnabled,
  setSiteDisabled,
  setUserRules,
} from "../../lib/storage";
import type { Rule } from "../../lib/types";
import "../../components/haze-ui.css";
import "./style.css";

interface Site {
  tabId: number;
  url: string;
  hostname: string;
  key: string;
  noPrompt: boolean;
}

async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function launchPicker(site: Site) {
  if (!site.noPrompt) {
    const pattern = originPattern(site.url);
    const has = await browser.permissions.contains({ origins: [pattern] });
    if (!has) {
      const granted = await browser.permissions.request({ origins: [pattern] });
      if (!granted) return;
    }
  }
  await browser.scripting.executeScript({
    target: { tabId: site.tabId },
    files: ["/picker.js"],
  });
  window.close();
}

function Popup() {
  const [loaded, setLoaded] = useState(false);
  const [global, setGlobal] = useState(true);
  const [site, setSite] = useState<Site | null>(null);
  const [siteOn, setSiteOn] = useState(true);
  const [rules, setRules] = useState<Rule[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const tab = await activeTab();
      const state = await loadState();
      setGlobal(state.globalEnabled);
      const url = tab?.url;
      if (isInjectableUrl(url) && tab?.id != null && url) {
        const hostname = new URL(url).hostname;
        const key = hostKey(hostname);
        setSite({
          tabId: tab.id,
          url,
          hostname,
          key,
          noPrompt: isBuiltinHost(hostname),
        });
        setSiteOn(!state.siteDisabled[key]);
        setRules(state.userRules[key] ?? []);
      }
      setLoaded(true);
    })();
  }, []);

  const persist = (next: Rule[]) => {
    setRules(next);
    if (site) setUserRules(site.key, next);
  };
  const patchRule = (id: string, patch: RulePatch) =>
    persist(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRule = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    persist(rules.filter((r) => r.id !== id));
  };
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div class="app">
      <header>
        <div class="brand">
          <span class="logo">◐</span>
          <span>Haze</span>
        </div>
        <Switch
          checked={global}
          title="Master on/off"
          onChange={(on) => {
            setGlobal(on);
            setGlobalEnabled(on);
          }}
        />
      </header>

      <main>
        {loaded && !site && (
          <section class="site">
            <p class="host">Not available here</p>
            <p class="note">Haze can only run on normal web pages.</p>
          </section>
        )}

        {site && (
          <>
            <section class="site">
              <div class="site-row">
                <span class="host" title={site.hostname}>
                  {site.hostname}
                </span>
                <Switch
                  small
                  checked={siteOn}
                  title="Enable on this site"
                  onChange={(on) => {
                    setSiteOn(on);
                    setSiteDisabled(site.key, !on);
                  }}
                />
              </div>
              <button
                type="button"
                class="pick"
                onClick={() => launchPicker(site)}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Pick element to blur
              </button>
            </section>

            <section class="rules">
              <h2>
                Your rules{rules.length ? <span> {rules.length}</span> : null}
              </h2>
              {rules.length === 0 ? (
                <p class="empty">None yet. Pick an element above to add one.</p>
              ) : (
                <ul class="rule-list">
                  {rules.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      open={expanded.has(rule.id)}
                      onToggleOpen={() => toggleExpand(rule.id)}
                      onToggleEnabled={() =>
                        patchRule(rule.id, { enabled: !rule.enabled })
                      }
                      onChange={(patch) => patchRule(rule.id, patch)}
                      onDelete={() => removeRule(rule.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>

      <footer>
        <button
          type="button"
          class="aslink"
          onClick={() => browser.runtime.openOptionsPage()}
        >
          Manage all rules →
        </button>
      </footer>
    </div>
  );
}

const root = document.getElementById("app");
if (root) render(<Popup />, root);
