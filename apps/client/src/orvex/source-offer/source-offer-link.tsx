import { useQuery } from "@tanstack/react-query";
import { Text, Tooltip } from "@mantine/core";
import api from "@/lib/api-client";

/**
 * AGPL §13 source offer (ENG-2500 AC3) — the visible UI link to the
 * corresponding source of the exact running build.
 *
 * Reads the canonical, unauthenticated source-offer endpoint
 * (`GET /api/orvex/source` → `{sha, sourceRepo}`, from
 * `ORVEX_GIT_SHA`/`ORVEX_SOURCE_REPO`) and renders a link to the public
 * source repository, labelled with the exact built commit. This is the
 * client-side half of the offer documented in `LICENSE-COMPLIANCE.md` at
 * the repository root.
 *
 * Honesty (CS §11): when the offer is unavailable (endpoint unreachable or
 * unconfigured — the server fails LOUD with 500 rather than fabricating a
 * sha), this component renders nothing. It never invents a sha or URL.
 */

export interface ISourceOffer {
  sha: string;
  sourceRepo: string;
}

export async function getSourceOffer(): Promise<ISourceOffer> {
  const req = await api.get<ISourceOffer>("/orvex/source");
  return req.data as unknown as ISourceOffer;
}

export function useSourceOffer() {
  return useQuery<ISourceOffer, Error>({
    queryKey: ["orvex-source-offer"],
    queryFn: getSourceOffer,
    staleTime: 60 * 60 * 1000, // static per-build values (build-time env)
    retry: false,
  });
}

export default function SourceOfferLink() {
  const { data: offer } = useSourceOffer();

  if (!offer?.sha || !offer?.sourceRepo) {
    // No fabricated fallback: without a real offer there is no link.
    return null;
  }

  const shortSha = offer.sha.slice(0, 7);

  return (
    <Tooltip label={`AGPL-3.0 corresponding source — build ${offer.sha}`}>
      <Text
        size="sm"
        c="dimmed"
        component="a"
        href={offer.sourceRepo}
        target="_blank"
        rel="noreferrer"
        aria-label="Source code (AGPL corresponding source)"
      >
        Source code ({shortSha})
      </Text>
    </Tooltip>
  );
}
