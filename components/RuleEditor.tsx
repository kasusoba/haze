// The shared rule editor: the same field controls in the popup, the options
// page, and (the effect subset) the picker. `onChange` receives a partial patch
// to merge into the rule; the parent owns persistence.
import { useState } from "preact/hooks";
import { isValidSelector } from "../lib/selector";
import {
  DEFAULT_BG,
  type Effect,
  EFFECTS,
  type Reveal,
  type Rule,
} from "../lib/types";
import { CheckboxRow, Field, Select } from "./controls";

const REVEALS: readonly Reveal[] = ["hover", "click"];

export type RulePatch = Partial<Rule>;

/** `<input type=color>` only speaks 6-digit hex; coerce short/absent values. */
function toHex(color: string | undefined): string {
  const c = color ?? DEFAULT_BG;
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  const m = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(c);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  return "#888888";
}

/** The effect settings shared by every surface (incl. the picker). */
export function EffectFields({
  rule,
  onChange,
}: {
  rule: Rule;
  onChange: (patch: RulePatch) => void;
}) {
  const hidden = rule.effect === "hide";
  const card = rule.effect === "scratchcard";
  return (
    <>
      <Field name="Effect">
        <Select<Effect>
          value={rule.effect}
          options={EFFECTS}
          fixed
          onChange={(effect) => onChange({ effect })}
        />
      </Field>
      <Field name="Reveal" disabled={hidden}>
        <Select<Reveal>
          value={rule.reveal}
          options={REVEALS}
          fixed
          disabled={hidden}
          onChange={(reveal) => onChange({ reveal })}
        />
      </Field>
      <Field name="Blur" disabled={hidden}>
        <span class="field-ctl row">
          <input
            class="ctl"
            type="number"
            min="0"
            value={rule.intensity}
            disabled={hidden}
            onChange={(e) =>
              onChange({ intensity: Number(e.currentTarget.value) || 0 })
            }
          />
          <span class="field-suffix">px</span>
        </span>
      </Field>
      {card && (
        <Field name="Color">
          <input
            class="color"
            type="color"
            value={toHex(rule.bg)}
            onChange={(e) => onChange({ bg: e.currentTarget.value })}
          />
        </Field>
      )}
      <CheckboxRow
        name="Grayscale"
        checked={rule.grayscale}
        disabled={hidden}
        onChange={(grayscale) => onChange({ grayscale })}
      />
    </>
  );
}

function SelectorField({
  rule,
  onChange,
}: {
  rule: Rule;
  onChange: (patch: RulePatch) => void;
}) {
  const [value, setValue] = useState(rule.selector);
  const invalid = value.trim() !== "" && !isValidSelector(value.trim());
  return (
    <Field name="Selector">
      <input
        class={`ctl mono grow sel${invalid ? " invalid" : ""}`}
        type="text"
        spellcheck={false}
        value={value}
        onInput={(e) => setValue(e.currentTarget.value)}
        onChange={(e) => onChange({ selector: e.currentTarget.value.trim() })}
      />
    </Field>
  );
}

export interface RuleEditorProps {
  rule: Rule;
  onChange: (patch: RulePatch) => void;
  /** Show the raw CSS selector field (popup/options: yes; picker owns its own). */
  showSelector?: boolean;
  /** Show the label-anchor + text-pattern advanced fields. */
  showAdvanced?: boolean;
}

/** Full editor body used by the popup and options page. */
export function RuleEditor({
  rule,
  onChange,
  showSelector = true,
  showAdvanced = true,
}: RuleEditorProps) {
  return (
    <div class="rule-editor">
      {showSelector && <SelectorField rule={rule} onChange={onChange} />}
      <EffectFields rule={rule} onChange={onChange} />
      {showAdvanced && (
        <>
          <Field name="Label">
            <input
              class="ctl grow"
              type="text"
              placeholder="none"
              spellcheck={false}
              value={rule.label ?? ""}
              onChange={(e) =>
                onChange({ label: e.currentTarget.value.trim() || undefined })
              }
            />
          </Field>
          <Field name="Text">
            <input
              class="ctl mono grow"
              type="text"
              placeholder="whole element"
              spellcheck={false}
              value={rule.text ?? ""}
              onChange={(e) =>
                onChange({ text: e.currentTarget.value.trim() || undefined })
              }
            />
          </Field>
        </>
      )}
    </div>
  );
}
