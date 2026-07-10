import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { Spotlight } from "@mantine/spotlight";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { TranslatePickerMenu } from "../translate-picker-menu";

/**
 * ENG-1395 AC5 — translate picker forwards the chosen language.
 *
 * Assertion (as specified): on pick, `runAction(editor, action, {mode,
 * options})` is invoked with the selected language present in `options`
 * (spy on the exported `runAction`).
 */
describe("TranslatePickerMenu", () => {
  function makeEditor() {
    return new Editor({
      extensions: [Document, Paragraph, Text],
      content: "<p>hello world</p>",
    });
  }

  test("picking a language calls runAction with that language in options", () => {
    const editor = makeEditor();
    const runActionSpy = vi.fn().mockResolvedValue(undefined);

    render(
      <MantineProvider>
        <Spotlight.Root store={undefined} forceOpened>
          <Spotlight.ActionsList>
            <TranslatePickerMenu
              editor={editor}
              params={{ mode: "replace", range: { from: 7, to: 12 }, content: "world" }}
              deps={{ streamFn: vi.fn() }}
              runActionImpl={runActionSpy}
            />
          </Spotlight.ActionsList>
        </Spotlight.Root>
      </MantineProvider>,
    );

    fireEvent.click(screen.getByText("Spanish"));

    expect(runActionSpy).toHaveBeenCalledTimes(1);
    const [calledEditor, calledAction, calledParams] = runActionSpy.mock.calls[0];
    expect(calledEditor).toBe(editor);
    expect(calledAction.id).toBe("translate");
    expect(calledParams).toEqual(
      expect.objectContaining({
        mode: "replace",
        options: expect.objectContaining({ language: "Spanish" }),
      }),
    );

    editor.destroy();
  });
});
