// A rule as a compact header that expands into the shared RuleEditor. Used by
// both the popup and the options page so the two surfaces look identical.
import { RuleEditor, type RulePatch } from "./RuleEditor";
import type { Rule } from "../lib/types";

export function RuleCard({
  rule,
  open,
  onToggleOpen,
  onToggleEnabled,
  onChange,
  onDelete,
}: {
  rule: Rule;
  open: boolean;
  onToggleOpen: () => void;
  onToggleEnabled: () => void;
  onChange: (patch: RulePatch) => void;
  onDelete: () => void;
}) {
  return (
    <li class={`rule-card${open ? " open" : ""}${rule.enabled ? "" : " off"}`}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: header row is a disclosure toggle with explicit buttons inside */}
      <div class="rule-head" onClick={onToggleOpen}>
        <span class="sel" title={rule.selector}>
          {rule.selector}
        </span>
        <span class="tag">{rule.effect}</span>
        <button
          type="button"
          class="iconbtn state"
          title={rule.enabled ? "Disable" : "Enable"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleEnabled();
          }}
        >
          {rule.enabled ? "◉" : "○"}
        </button>
        <button
          type="button"
          class="iconbtn del"
          title="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          ✕
        </button>
      </div>
      {open && <RuleEditor rule={rule} onChange={onChange} />}
    </li>
  );
}
