// Small shared form primitives used across the popup, options, and picker.
import type { ComponentChildren } from "preact";

/** A labeled editor row: `[ name ] [ control... ]`. */
export function Field({
  name,
  disabled,
  children,
}: {
  name: string;
  disabled?: boolean;
  children: ComponentChildren;
}) {
  return (
    <div class={`field${disabled ? " disabled" : ""}`}>
      <span class="field-name">{name}</span>
      {children}
    </div>
  );
}

export function Select<T extends string>({
  value,
  options,
  disabled,
  grow,
  fixed,
  onChange,
}: {
  value: T;
  options: readonly T[];
  disabled?: boolean;
  grow?: boolean;
  /** Give the control the shared fixed control width (effect/reveal/blur align). */
  fixed?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <select
      class={`ctl${grow ? " grow" : ""}${fixed ? " field-ctl" : ""}`}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.currentTarget.value as T)}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/** Checkbox rendered as a labeled row (whole row is the label). */
export function CheckboxRow({
  name,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label class={`cb${disabled ? " disabled" : ""}`}>
      <span class="field-name">{name}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    </label>
  );
}

/** A pill on/off switch. */
export function Switch({
  checked,
  small,
  title,
  onChange,
}: {
  checked: boolean;
  small?: boolean;
  title?: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <label class={`switch${small ? " sm" : ""}`} title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span class="slider" />
    </label>
  );
}
