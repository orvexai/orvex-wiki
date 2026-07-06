/**
 * @orvex/dfm — the clean-room AGPL TypeScript twin of the DfM serializer
 * (A-DFM / FR-W18).
 *
 * Equivalence with the family's Go serializer (`orvex-studio-lib/pkg/dfm`)
 * flows ONLY through the shared contract fixtures (orvex-studio-contracts
 * fixtures/dfm/**), never through shared code (D-CON-8). The engine's future
 * write path imports THIS package; closed satellites use the Go twin and NEVER
 * import this one.
 */
export type { PmMark, PmNode, PmDoc, Dfm } from './types';
export {
  DfmNotImplementedError,
  DfmOpaqueUnknownRefError,
  DFM_NOT_IMPLEMENTED,
  DFM_OPAQUE_UNKNOWN_REF,
} from './errors';
export { NodeSerializerRegistry } from './registry';
export type { NodeSerializer, SerializeChild } from './registry';
export { pmToDfm, serializeOpaque, createDefaultRegistry } from './pm-to-dfm';
export { dfmToJson } from './dfm-to-json';
