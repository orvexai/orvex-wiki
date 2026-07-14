import {
  IconSparkles,
  IconCheck,
  IconTextPlus,
  IconAlignJustified,
  IconWriting,
  IconHelp,
  IconList,
  IconMoodSmile,
  IconLanguage,
} from "@tabler/icons-react";
import { AiAction } from "@/ee/ai/types/ai.types.ts";

/**
 * ENG-1395 — AiPalette action + translate-language catalogues.
 *
 * These are UI picker lists only (labels + the existing `AiAction` enum
 * value each forwards) — no prompt text, no model/agent logic (AC8; CS §6
 * confinement). All prompt construction happens server-side in
 * `orvex-studio-ai` (blocked-by ENG-1415); the client only forwards the
 * chosen `AiAction` + optional `language`/`tone` option.
 */
export interface AiPaletteAction {
  id: string;
  label: string;
  action: AiAction;
  icon: typeof IconSparkles;
}

export const PALETTE_ACTIONS: AiPaletteAction[] = [
  { id: "improve-writing", label: "Improve writing", action: AiAction.IMPROVE_WRITING, icon: IconSparkles },
  { id: "fix-spelling-grammar", label: "Fix spelling & grammar", action: AiAction.FIX_SPELLING_GRAMMAR, icon: IconCheck },
  { id: "make-longer", label: "Make longer", action: AiAction.MAKE_LONGER, icon: IconTextPlus },
  { id: "make-shorter", label: "Make shorter", action: AiAction.MAKE_SHORTER, icon: IconAlignJustified },
  { id: "continue-writing", label: "Continue writing", action: AiAction.CONTINUE_WRITING, icon: IconWriting },
  { id: "explain", label: "Explain", action: AiAction.EXPLAIN, icon: IconHelp },
  { id: "summarize", label: "Summarize", action: AiAction.SUMMARIZE, icon: IconList },
  { id: "change-tone", label: "Change tone", action: AiAction.CHANGE_TONE, icon: IconMoodSmile },
];

export const TRANSLATE_ACTION: AiPaletteAction = {
  id: "translate",
  label: "Translate",
  action: AiAction.TRANSLATE,
  icon: IconLanguage,
};

// Picker list only — the language NAME is forwarded as an option; no
// per-language prompt template lives here (AC8).
export const TRANSLATE_LANGUAGES: string[] = [
  "English",
  "Spanish",
  "German",
  "French",
  "Dutch",
  "Portuguese",
  "Italian",
  "Japanese",
  "Korean",
  "Swedish",
  "Simplified Chinese",
];
