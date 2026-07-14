import api from "@/lib/api-client";
import { IPage } from "@/features/page/types/page.types";
import { ProvenanceStatus } from "@/ee/page-provenance/types/page-provenance.types";

/**
 * ENG-1460 — fetch the engine-stamped provenance status for a page.
 *
 * Deliberately reuses the existing `/pages/info` endpoint (the page row
 * carries `provenanceStatus` once the engine leg joins it in) rather than
 * adding a new port — the client is a pure projection, not a new
 * provenance surface.
 *
 * NOTE (review F1, fix pass 3): the SERVER wraps every non-`@SkipTransform`
 * response body in `{ data, success, status }`
 * (`TransformHttpResponseInterceptor`), and `api`'s axios response
 * interceptor (see `@/lib/api-client`) only unwraps the RAW axios envelope
 * down to `response.data` — one level, not two. So `api.post<IPage>(...)`
 * resolves at runtime with `{ data: IPage, success, status }`, and a
 * SECOND `.data` deref is required to reach the real `IPage`. This mirrors
 * the sibling `getPageById` in `page-service.ts`, which does the same
 * `req.data` unwrap.
 */
export async function getPageProvenance(
  pageId: string,
): Promise<ProvenanceStatus> {
  const req = await api.post<IPage>("/pages/info", { pageId });
  return req.data?.provenanceStatus ?? null;
}
