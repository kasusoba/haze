import type { Effect, Reveal } from "./types";

/** Sent by the picker (content context) to the background when a rule is created. */
export interface CreateRuleMessage {
  type: "haze:create-rule";
  selector: string;
  effect: Effect;
  reveal: Reveal;
  intensity: number;
  grayscale: boolean;
  /** Scratchcard overlay color chosen in the picker. */
  bg?: string;
  /** Optional regex source for sub-element text redaction. See lib/text.ts. */
  text?: string;
  /** Optional label anchor for `Label: value` rows. See lib/anchor.ts. */
  label?: string;
}

export type HazeMessage = CreateRuleMessage;

export interface CreateRuleResponse {
  ok: boolean;
  error?: string;
}
