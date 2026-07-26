/**
 * @orvex/dfm — the clean-room AGPL TypeScript twin of the DfM serializer
 * (A-DFM / FR-W18), a standalone workspace package (ENG-2487).
 *
 * Equivalence with the family's Go serializer (`orvex-studio-lib/pkg/dfm`)
 * flows ONLY through the shared contract fixtures (orvex-studio-contracts
 * fixtures/dfm/**, vendored under test/fixtures/dfm/), never through shared
 * code (D-CON-8). The engine's write path (`page.service.ts`,
 * `collaboration.util.ts`) imports THIS package; closed satellites use the Go
 * twin or a wiki-api network call and NEVER import this one (enforced by
 * scripts/ci/dfm-import-guard.sh, ENG-2488).
 *
 * Export surface: serializer functions + typed errors + the registry SSoT
 * ONLY. The DfM VERB grammar (block-patch grammar over DfM) deliberately does
 * NOT live here — that is wiki-api's concern (FR-W18 non-goal).
 */
import './common-nodes'; // side-effecting: registers every node/mark entry

export type {
  PmMark,
  PmNode,
  PmDoc,
  Dfm,
  SerializerCtx,
  NodeEntry,
  MarkEntry,
} from './types';
export {
  DfmNotImplementedError,
  DfmOpaqueUnknownRefError,
  DFM_NOT_IMPLEMENTED,
  DFM_OPAQUE_UNKNOWN_REF,
} from './errors';
export {
  registerNode,
  getEntry,
  hasEntry,
  registeredTypes,
  registerMark,
  getMark,
  registeredMarkTypes,
  markFromToken,
} from './registry';
export { pmToDfm } from './pm-to-dfm';
export { dfmToJson } from './dfm-to-json';
export {
  reattachOpaqueRefs,
  buildNodeIndex,
  OPAQUE_REF_TYPE,
} from './reattach-opaque';
