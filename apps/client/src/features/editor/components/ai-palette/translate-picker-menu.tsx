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
export interface TranslatePickerMenuProps {
  editor: Editor;
  params: Omit<RunActionParams, "options" | "mode"> & { mode: RunActionParams["mode"] };
  deps: RunActionDeps;
  runActionImpl?: typeof runAction;
}

export const TranslatePickerMenu: FC<TranslatePickerMenuProps> = ({
  editor,
  params,
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
          onClick={() =>
            runActionImpl(
              editor,
              TRANSLATE_ACTION,
              { ...params, options: { language } },
              deps,
            )
          }
        />
      ))}
    </>
  );
};
