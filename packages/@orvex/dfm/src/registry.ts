import { PmNode } from './types';

/**
 * The node/mark registry (A-DFM). Every additive node/mark registers here so
 * both serializers agree on the wire form (minus all Linear nodes — the fork's
 * Linear editor NodeViews are never folded in, D-S11). A node type absent from
 * the registry serializes to the lossless `:::dfm-opaque` fence.
 */
export interface DfmNodeSerializer {
  /** The ProseMirror node type this handles. */
  type: string;
  /** Serialize a PM node to a DfM fragment. */
  toDfm(node: PmNode): string;
}

const registry = new Map<string, DfmNodeSerializer>();

export function registerNode(serializer: DfmNodeSerializer): void {
  registry.set(serializer.type, serializer);
}

export function getNodeSerializer(type: string): DfmNodeSerializer | undefined {
  return registry.get(type);
}

export function isKnownNode(type: string): boolean {
  return registry.has(type);
}

/** SCAFFOLD: common nodes are registered in common-nodes.ts (see registerCommonNodes). */
export function registeredTypes(): string[] {
  return [...registry.keys()];
}
