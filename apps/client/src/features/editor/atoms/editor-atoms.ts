import { atom } from "jotai";
import { Editor } from "@tiptap/core";
import { PageEditMode } from "@/features/user/types/user.types.ts";

export const pageEditorAtom = atom<Editor | null>(null);

export const titleEditorAtom = atom<Editor | null>(null);

export const readOnlyEditorAtom = atom<Editor | null>(null);

export const yjsConnectionStatusAtom = atom<string>("");

export const yjsSyncedAtom = atom<boolean>(false);

export const showLinkMenuAtom = atom(false);

// ENG-1395 AC7 — reflects true in-flight state for the AiPalette's streamed
// transform; reset to false on both complete and error so the palette never
// gets stuck showing a spinner (CS §10 never-white-screen).
export const isAiTransformInFlightAtom = atom(false);

// ENG-1395 AC7 — last inline error message from a streamed transform, shown
// inline in the palette (never a white screen). Cleared on the next run.
//
// NOTE: initialized via a pre-typed `const` (not `atom<string | null>(null)`
// directly) — with this project's `strictNullChecks: false`, the bare
// literal `null` argument resolves jotai's `atom()` to its READ-ONLY
// overload (`atom<Value>(read: Read<Value>)`), silently producing a
// non-writable atom (see the pre-existing `// @ts-ignore` on `pageEditorAtom`
// in `page-editor.tsx` for the same quirk). Assigning the initial value to a
// typed variable first avoids the ambiguous overload match without an
// `@ts-ignore` escape.
const noAiPaletteError: string | null = null;
export const aiPaletteErrorAtom = atom(noAiPaletteError);

// Current page's edit mode — initialized from the user's saved preference on
// first load, can be toggled locally without persisting to the server.
export const currentPageEditModeAtom = atom<PageEditMode>(PageEditMode.Edit);
