import { FC, useState } from "react";
import { Editor } from "@tiptap/core";
import { Spotlight, createSpotlight } from "@mantine/spotlight";
import { Switch, Text } from "@mantine/core";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { generateAiContentStream } from "@/ee/ai/services/ai-service.ts";
import { isAiTransformInFlightAtom, aiPaletteErrorAtom } from "@/features/editor/atoms/editor-atoms";
import { PALETTE_ACTIONS, TRANSLATE_ACTION } from "./constants";
import { TranslatePickerMenu } from "./translate-picker-menu";
import { runAction, RunActionDeps, toAiStreamFn } from "./run-action";
import { useCapturedContext } from "./use-captured-context";

/**
 * ENG-1395 — `Mod+J` AiPalette (`@mantine/spotlight`), superseding the
 * old preview-menu `EditorAiMenu` (AC9). Captures selection/block context
 * at open-time (AC1), streams the picked action's result directly into the
 * captured range via `runAction`/`OrvexAiInlineHandler` (AC2/AC3), supports
 * Replace vs Insert-below (AC6) and Translate (AC5), surfaces stream
 * errors inline and clears the in-flight atom (AC7), and safely no-ops on
 * an unrecognized future action (AC10, delegated to `runAction`).
 *
 * Zero prompt/model/agent logic here (AC8) — only capture + forward to the
 * existing SSE seam via the reused `generateAiContentStream`.
 */
export const [aiPaletteStore, aiPalette] = createSpotlight();

export interface AiPaletteProps {
  editor: Editor | null;
}

export const AiPalette: FC<AiPaletteProps> = ({ editor }) => {
  const { t } = useTranslation();
  const [translateOpen, setTranslateOpen] = useState(false);
  const [insertBelow, setInsertBelow] = useState(false);
  const [isInFlight, setIsInFlight] = useAtom(isAiTransformInFlightAtom);
  const [aiError, setAiError] = useAtom(aiPaletteErrorAtom);
  const { capturedContextRef, captureNow, clear } = useCapturedContext(editor);

  if (!editor) return null;

  const deps: RunActionDeps = {
    streamFn: toAiStreamFn(generateAiContentStream),
    setInFlight: setIsInFlight,
    setError: (error) => setAiError(error),
  };

  const runParams = () => {
    const captured = capturedContextRef.current;
    if (!captured) return null;
    return {
      mode: (insertBelow ? "insert-below" : "replace") as "insert-below" | "replace",
      range: { from: captured.from, to: captured.to },
      content: captured.text,
    };
  };

  return (
    <Spotlight.Root
      store={aiPaletteStore}
      shortcut="mod+J"
      onSpotlightOpen={() => {
        setTranslateOpen(false);
        setAiError(null);
        captureNow();
      }}
      onSpotlightClose={() => {
        clear();
      }}
      scrollable
    >
      <Spotlight.Search placeholder={t("Ask AI...")} aria-label={t("Ask AI")} />
      {aiError && (
        <Text c="red" size="sm" px="md" py="xs" data-testid="ai-palette-error">
          {aiError}
        </Text>
      )}
      <Switch
        px="md"
        py="xs"
        size="xs"
        label={t("Insert below instead of replacing")}
        checked={insertBelow}
        onChange={(event) => setInsertBelow(event.currentTarget.checked)}
      />
      <Spotlight.ActionsList>
        {translateOpen ? (
          <TranslatePickerMenu
            editor={editor}
            getParams={runParams}
            deps={deps}
          />
        ) : (
          PALETTE_ACTIONS.map((action) => (
            <Spotlight.Action
              key={action.id}
              label={action.label}
              leftSection={<action.icon size={18} stroke={1.5} />}
              disabled={isInFlight}
              onClick={() => {
                if (action.id === TRANSLATE_ACTION.id) {
                  setTranslateOpen(true);
                  return;
                }
                const params = runParams();
                if (!params) return;
                runAction(editor, action, params, deps);
              }}
            />
          ))
        )}
      </Spotlight.ActionsList>
    </Spotlight.Root>
  );
};
