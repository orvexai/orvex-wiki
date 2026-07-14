import { FC } from "react";
import { Editor } from "@tiptap/core";
import { Spotlight } from "@mantine/spotlight";
import { IconLanguage } from "@tabler/icons-react";
import { TRANSLATE_ACTION, TRANSLATE_LANGUAGES } from "./constants";
import { runAction, RunActionDeps, RunActionParams } from "./run-action";

/**
 * ENG-1395 AC5 — translate picker: forwards the chosen language via
 * `runAction`'s `options.language`. No language-specific prompt template
 * lives here — just the picker list + forward-to-SSE (AC8).
 */
type TranslateParams = Omit<RunActionParams, "options" | "mode"> & {
  mode: RunActionParams["mode"];
};

export interface TranslatePickerMenuProps {
  editor: Editor;
  /**
   * ENG-1395 fix-2 — a getter, not a precomputed value: reading
   * `capturedContextRef.current` must happen at click-time (inside this
   * component's `onClick` handler), never during render. Passing an
   * already-dereferenced `params` object forced the caller to read the ref
   * while rendering `<AiPalette>`, tripping `react-hooks/refs` ("Cannot
   * access refs during render"). Deferring the read to the handler is both
   * lint-clean and strictly more correct: it captures whatever is current
   * at the moment of the click rather than at the moment of the render.
   */
  getParams: () => TranslateParams | null;
  deps: RunActionDeps;
  runActionImpl?: typeof runAction;
}

export const TranslatePickerMenu: FC<TranslatePickerMenuProps> = ({
  editor,
  getParams,
  deps,
  runActionImpl = runAction,
}) => {
  return (
    <>
      {TRANSLATE_LANGUAGES.map((language) => (
        <Spotlight.Action
          key={language}
          label={language}
          leftSection={<IconLanguage size={18} stroke={1.5} />}
          onClick={() => {
            const params = getParams();
            if (!params) return;
            runActionImpl(
              editor,
              TRANSLATE_ACTION,
              { ...params, options: { language } },
              deps,
            );
          }}
        />
      ))}
    </>
  );
};
