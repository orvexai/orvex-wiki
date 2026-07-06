import type { PmNode } from './types';

/**
 * Recurse into a child node. A {@link NodeSerializer} receives this so a block
 * serializer can serialize its own `content` without owning the dispatch table.
 */
export type SerializeChild = (node: PmNode) => string;

/**
 * A node-type serializer: given the node and a child-recursion callback, return
 * the node's DfM fragment. Must NOT swallow unimplemented children — recursion
 * flows back through {@link SerializeChild}, which throws for unknown types.
 */
export type NodeSerializer = (node: PmNode, serializeChild: SerializeChild) => string;

/**
 * A real, mutable map of node type -> serializer. This is the dispatch table
 * the write path builds on; there is no hidden fallback that fabricates output
 * for an unregistered type (lookup returns `undefined`, and the caller throws).
 */
export class NodeSerializerRegistry {
  private readonly table = new Map<string, NodeSerializer>();

  /** Register (or replace) the serializer for `nodeType`. Chainable. */
  register(nodeType: string, serializer: NodeSerializer): this {
    this.table.set(nodeType, serializer);
    return this;
  }

  /** The serializer for `nodeType`, or `undefined` if none is registered. */
  lookup(nodeType: string): NodeSerializer | undefined {
    return this.table.get(nodeType);
  }

  /** Whether a serializer is registered for `nodeType`. */
  has(nodeType: string): boolean {
    return this.table.has(nodeType);
  }

  /** The registered node types (insertion order). */
  registeredTypes(): string[] {
    return [...this.table.keys()];
  }

  /** Number of registered node types. */
  get size(): number {
    return this.table.size;
  }
}
