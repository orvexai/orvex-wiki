import api from "@/lib/api-client";
import { IPage } from "@/features/page/types/page.types";
import { ProvenanceStatus } from "@/ee/page-provenance/types/page-provenance.types";

/**
 * ENG-1460 — fetch the engine-stamped provenance status for a page.
 *
 * Deliberately reuses the existing `/pages/info` endpoint (the page row
 * already carries `provenanceStatus`, per ENG-1447's `PageRepo.baseFields`)
 * rather than adding a new port — the client is a pure projection, not a
 * new provenance surface.
 */
export async function getPageProvenance(
  pageId: string,
): Promise<ProvenanceStatus> {
  const req = await api.post<IPage>("/pages/info", { pageId });
  return (req as unknown as { data: IPage }).data.provenanceStatus ?? null;
}
