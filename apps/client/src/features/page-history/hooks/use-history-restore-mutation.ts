import { useCallback, useReducer } from "react";
import { useMutation, UseMutationResult } from "@tanstack/react-query";
import { restorePageFromHistory } from "@/features/page-history/services/page-history-service";
import { IPageHistory } from "@/features/page-history/types/page.types";
import {
  historyRestoreReducer,
  initialHistoryRestoreState,
} from "@/features/page-history/hooks/history-restore-logic";

export interface RestoreFromHistoryVariables {
  pageId: string;
  restoreFromHistoryId: string;
}

/**
 * ENG-1369 (AC6) — thin hook wiring the pure `historyRestoreReducer` state
 * machine to the actual `/pages/history/restore` mutation. The reducer is
 * the single source of truth for `pendingRestoreId`; this hook only feeds
 * it TRIGGER/SUCCESS/FAILURE at the right points in the mutation
 * lifecycle.
 */
export function useHistoryRestoreMutation(): {
  pendingRestoreId: string | null;
  mutation: UseMutationResult<
    IPageHistory,
    Error,
    RestoreFromHistoryVariables
  >;
  mutateAsync: (
    variables: RestoreFromHistoryVariables,
  ) => Promise<IPageHistory>;
} {
  const [state, dispatch] = useReducer(
    historyRestoreReducer,
    initialHistoryRestoreState,
  );

  const mutation = useMutation<IPageHistory, Error, RestoreFromHistoryVariables>({
    mutationFn: ({ pageId, restoreFromHistoryId }) =>
      restorePageFromHistory(pageId, restoreFromHistoryId),
  });

  const mutateAsync = useCallback(
    async (variables: RestoreFromHistoryVariables) => {
      dispatch({ type: "TRIGGER", historyId: variables.restoreFromHistoryId });
      try {
        const result = await mutation.mutateAsync(variables);
        dispatch({ type: "SUCCESS" });
        return result;
      } catch (err) {
        dispatch({ type: "FAILURE" });
        throw err;
      }
    },
    [mutation],
  );

  return { pendingRestoreId: state.pendingRestoreId, mutation, mutateAsync };
}
