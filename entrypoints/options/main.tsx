import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { browser } from "wxt/browser";
import { Switch } from "../../components/controls";
import { RuleCard } from "../../components/RuleCard";
import type { RulePatch } from "../../components/RuleEditor";
import {
  type HazeState,
  loadState,
  setGlobalEnabled,
  setSiteDisabled,
  setUserRules,
} from "../../lib/storage";
import { normalizeEffect, type Rule } from "../../lib/types";
import "../../components/haze-ui.css";
import "./style.css";

function Caret() {
  return (
    <svg
      class="caret"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 3v12" />
      <path d="M8 11l4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 15V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

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

function Options() {
  const [state, setState] = useState<HazeState | null>(null);
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadState().then(setState);
  }, []);

  if (!state) return null;
  const keys = Object.keys(state.userRules).sort();
  const version = browser.runtime.getManifest().version;
  const allExpanded =
    keys.length > 0 && keys.every((k) => expandedSites.has(k));

  const setGlobal = (on: boolean) => {
    setState({ ...state, globalEnabled: on });
    setGlobalEnabled(on);
  };
  const setSiteOn = (key: string, on: boolean) => {
    const siteDisabled = { ...state.siteDisabled };
    if (on) delete siteDisabled[key];
    else siteDisabled[key] = true;
    setState({ ...state, siteDisabled });
    setSiteDisabled(key, !on);
  };
  const persistRules = (key: string, rules: Rule[]) => {
    const userRules = { ...state.userRules };
    if (rules.length) userRules[key] = rules;
    else delete userRules[key];
    setState({ ...state, userRules });
    setUserRules(key, rules);
  };
  const patchRule = (key: string, id: string, patch: RulePatch) =>
    persistRules(
      key,
      (state.userRules[key] ?? []).map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      ),
    );
  const removeRule = (key: string, id: string) => {
    toggleSet(setExpandedRules, id, false);
    persistRules(
      key,
      (state.userRules[key] ?? []).filter((r) => r.id !== id),
    );
  };

  const toggleAllSites = () => {
    if (allExpanded) setExpandedSites(new Set());
    else setExpandedSites(new Set(keys));
  };

  const importFile = async (file: File) => {
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
    const userRules = (data.userRules ?? {}) as Record<string, Rule[]>;
    for (const rules of Object.values(userRules))
      for (const rule of rules) rule.effect = normalizeEffect(rule.effect);
    await browser.storage.sync.set({
      userRules,
      siteDisabled: data.siteDisabled ?? {},
      ...(typeof data.globalEnabled === "boolean"
        ? { globalEnabled: data.globalEnabled }
        : {}),
    });
    setState(await loadState());
  };

  return (
    <div class="wrap">
      <header>
        <div class="brand">
          <span class="logo">◐</span> Haze
        </div>
        <label class="master">
          <Switch checked={state.globalEnabled} onChange={setGlobal} />
          <span class="lbl">Master switch</span>
        </label>
      </header>

      <section>
        <h2>Your rules</h2>
        <div class="toolbar">
          <button
            type="button"
            onClick={toggleAllSites}
            disabled={!keys.length}
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </button>
          <button type="button" onClick={exportRules}>
            <DownloadIcon />
            Export
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            <UploadIcon />
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) importFile(file);
              e.currentTarget.value = "";
            }}
          />
          <span class="hint">
            Pick elements from any page via the toolbar popup.
          </span>
        </div>

        {keys.length === 0 ? (
          <p class="empty">
            No rules yet. Open any site, click the Haze toolbar icon, and pick
            an element.
          </p>
        ) : (
          keys.map((key) => {
            const rules = state.userRules[key] ?? [];
            const siteOn = !state.siteDisabled[key];
            const open = expandedSites.has(key);
            return (
              <div
                key={key}
                class={`site${open ? "" : " collapsed"}${siteOn ? "" : " site-off"}`}
              >
                <div class="site-head">
                  <button
                    type="button"
                    class="site-toggle"
                    onClick={() => toggleSet(setExpandedSites, key, !open)}
                  >
                    <Caret />
                    <span class="name">{key}</span>
                    <span class="count">
                      {rules.length} rule{rules.length === 1 ? "" : "s"}
                    </span>
                  </button>
                  <Switch
                    checked={siteOn}
                    onChange={(on) => setSiteOn(key, on)}
                  />
                </div>
                {open && (
                  <ul class="rule-list site-body">
                    {rules.map((rule) => (
                      <RuleCard
                        key={rule.id}
                        rule={rule}
                        open={expandedRules.has(rule.id)}
                        onToggleOpen={() =>
                          toggleSet(
                            setExpandedRules,
                            rule.id,
                            !expandedRules.has(rule.id),
                          )
                        }
                        onToggleEnabled={() =>
                          patchRule(key, rule.id, { enabled: !rule.enabled })
                        }
                        onChange={(patch) => patchRule(key, rule.id, patch)}
                        onDelete={() => removeRule(key, rule.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </section>

      <footer>v{version}</footer>
    </div>
  );
}

/** Add/remove a key from a Set held in state, immutably. */
function toggleSet(
  setter: (fn: (prev: Set<string>) => Set<string>) => void,
  key: string,
  present: boolean,
) {
  setter((prev) => {
    const next = new Set(prev);
    if (present) next.add(key);
    else next.delete(key);
    return next;
  });
}

const root = document.getElementById("app");
if (root) render(<Options />, root);
