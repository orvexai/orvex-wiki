// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { useState } from "react";
import {
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { searchSuggestions } from "@/features/search/services/search-service";
import { useSupersedePageMutation } from "@/features/page/queries/page-query";
import {
  canConfirmSupersede,
  PageDestinationSelection,
} from "./supersede-page-modal.utils";

export interface SupersedePageModalProps {
  pageId: string;
  opened: boolean;
  onClose: () => void;
}

/**
 * ENG-1440 (AC3, AC8) — pick a page destination to supersede this page
 * with. Confirm only ever fires `useSupersedePageMutation` with the
 * selected page's slugId (`canConfirmSupersede` is the single gate); a
 * rejected mutation (e.g. the engine's `403 CONFIRM_TOKEN_REQUIRED`)
 * renders inline and never tears down the modal.
 */
export function SupersedePageModal({
  pageId,
  opened,
  onClose,
}: SupersedePageModalProps) {
  const { t } = useTranslation("orvex");
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(query, 200);
  const [selection, setSelection] = useState<PageDestinationSelection | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const supersedeMutation = useSupersedePageMutation();

  const { data, isFetching } = useQuery({
    queryKey: ["page-search-suggestions", debouncedQuery],
    queryFn: () =>
      searchSuggestions({ query: debouncedQuery, includePages: true, limit: 10 }),
    enabled: opened && debouncedQuery.trim().length > 0,
  });

  const results = data?.pages ?? [];

  const handleClose = () => {
    setQuery("");
    setSelection(null);
    setError(null);
    onClose();
  };

  const handleConfirm = () => {
    if (!canConfirmSupersede(selection)) {
      return;
    }
    setError(null);
    supersedeMutation.mutate(
      { pageId, supersededBy: selection.slugId },
      {
        onSuccess: () => handleClose(),
        onError: (err) => {
          const message =
            (err as { response?: { data?: { message?: string } } })
              .response?.data?.message || t("Failed to supersede page");
          setError(message);
        },
      },
    );
  };

  return (
    <Modal.Root opened={opened} onClose={handleClose} size={500}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title fw={500}>{t("Supersede page")}</Modal.Title>
          <Modal.CloseButton aria-label={t("Close")} />
        </Modal.Header>
        <Modal.Body>
          <Text mb="xs" c="dimmed" size="sm">
            {t("Choose the page that replaces this one.")}
          </Text>

          <TextInput
            data-testid="supersede-search-input"
            placeholder={t("Search pages…")}
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setSelection(null);
            }}
            rightSection={isFetching ? <Loader size="xs" /> : null}
          />

          <ScrollArea.Autosize mah={220} mt="xs">
            {results.map((page) => (
              <UnstyledButton
                key={page.slugId}
                data-testid="supersede-search-result"
                w="100%"
                p="xs"
                onClick={() =>
                  setSelection({
                    type: "page",
                    slugId: page.slugId,
                    title: page.title,
                  })
                }
                style={{
                  background:
                    selection?.slugId === page.slugId
                      ? "var(--mantine-color-blue-light)"
                      : undefined,
                }}
              >
                {page.title || t("Untitled")}
              </UnstyledButton>
            ))}
          </ScrollArea.Autosize>

          {error && (
            <Text
              data-testid="supersede-inline-error"
              c="red"
              size="sm"
              mt="xs"
            >
              {error}
            </Text>
          )}

          <Group justify="end" mt="md">
            <Button onClick={handleClose} variant="default">
              {t("Cancel")}
            </Button>
            <Button
              data-testid="supersede-confirm-button"
              disabled={!canConfirmSupersede(selection)}
              loading={supersedeMutation.isPending}
              onClick={handleConfirm}
            >
              {t("Confirm")}
            </Button>
          </Group>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
