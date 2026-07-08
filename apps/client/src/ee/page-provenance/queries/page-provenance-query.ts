import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { getPageProvenance } from "@/ee/page-provenance/services/page-provenance-service";
import { ProvenanceStatus } from "@/ee/page-provenance/types/page-provenance.types";

/**
 * ENG-1460 AC5 — pure projection of the engine's provenance state.
 *
 * A transport error is caught here and folded into a `null` result (rather
 * than propagated as `isError`) — the badge must render a graceful
 * no-badge state, never a thrown render (CS §10 operability). The error is
 * still logged for operability visibility.
 */
export function usePageProvenanceQuery(
  pageId: string | undefined,
): UseQueryResult<ProvenanceStatus, Error> {
  return useQuery({
    queryKey: ["page-provenance", pageId],
    queryFn: async (): Promise<ProvenanceStatus> => {
      try {
        return await getPageProvenance(pageId!);
      } catch (error) {
        console.error(
          "[page-provenance] failed to load provenance status",
          error,
        );
        return null;
      }
    },
    enabled: !!pageId,
    retry: false,
  });
}
