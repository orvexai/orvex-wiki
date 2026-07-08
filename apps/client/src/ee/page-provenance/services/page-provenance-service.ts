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
 *
 * NOTE (review F1): `api`'s response interceptor (see `@/lib/api-client`)
 * already unwraps the axios envelope and resolves with `response.data`
 * directly — so despite the `AxiosResponse<IPage>`-shaped type parameter,
 * the value this `await` actually yields at runtime *is* the `IPage`, not
 * an `AxiosResponse` wrapping one. The type is a lie the rest of this
 * module's siblings (e.g. `getPageById`) also carry; cast through
 * `unknown` to the true runtime shape rather than propagating the wrong
 * `.data` deref.
 */
export async function getPageProvenance(
  pageId: string,
): Promise<ProvenanceStatus> {
  const req = await api.post<IPage>("/pages/info", { pageId });
  return (req as unknown as IPage).provenanceStatus ?? null;
}
