import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useParams } from "react-router-dom";
import {
  activeHistoryIdAtom,
  historyAtoms,
} from "@/features/page-history/atoms/history-atoms";
import { usePageHistoryQuery } from "@/features/page-history/queries/page-history-query";
import {
  pageEditorAtom,
  titleEditorAtom,
} from "@/features/editor/atoms/editor-atoms";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type";
import { useHistoryRestoreMutation } from "@/features/page-history/hooks/use-history-restore-mutation";

export function useHistoryRestore(pageId: string) {
  const { t } = useTranslation();

  const activeHistoryId = useAtomValue(activeHistoryIdAtom);
  const { data: activeHistoryData } = usePageHistoryQuery(activeHistoryId);

  const mainEditor = useAtomValue(pageEditorAtom);
  const mainEditorTitle = useAtomValue(titleEditorAtom);
  const setHistoryModalOpen = useSetAtom(historyAtoms);

  const { spaceSlug } = useParams();
  const { data: space } = useSpaceQuery(spaceSlug);
  const spaceAbility = useSpaceAbility(space?.membership?.permissions);

  const { pendingRestoreId, mutateAsync } = useHistoryRestoreMutation();

  const canRestore = spaceAbility.can(
    SpaceCaslAction.Manage,
    SpaceCaslSubject.Page,
  );

  const handleRestore = useCallback(async () => {
    if (!activeHistoryData) return;
    if (
      !mainEditor ||
      mainEditor.isDestroyed ||
      !mainEditorTitle ||
      mainEditorTitle.isDestroyed
    ) {
      return;
    }

    try {
      // ENG-1369 (AC6): the auditable server-side restore, THEN reflect it
      // in the live editor. On failure, the editor is left untouched and
      // pendingRestoreId is retained (see history-restore-logic.ts) so a
      // retry is possible.
      await mutateAsync({
        pageId,
        restoreFromHistoryId: activeHistoryData.id,
      });
    } catch (err) {
      notifications.show({
        message: t("Failed to restore version"),
        color: "red",
      });
      return;
    }

    mainEditorTitle
      .chain()
      .clearContent()
      .setContent(activeHistoryData.title, { emitUpdate: true })
      .run();

    mainEditor
      .chain()
      .clearContent()
      .setContent(activeHistoryData.content)
      .run();

    setHistoryModalOpen(false);
    notifications.show({ message: t("Successfully restored") });
  }, [
    activeHistoryData,
    mainEditor,
    mainEditorTitle,
    mutateAsync,
    pageId,
    setHistoryModalOpen,
    t,
  ]);

  const confirmRestore = useCallback(() => {
    modals.openConfirmModal({
      title: t("Please confirm your action"),
      children: (
        <Text size="sm">
          {t(
            "Are you sure you want to restore this version? Any changes not versioned will be lost.",
          )}
        </Text>
      ),
      labels: { confirm: t("Confirm"), cancel: t("Cancel") },
      onConfirm: handleRestore,
    });
  }, [t, handleRestore]);

  return { canRestore, confirmRestore, pendingRestoreId };
}
