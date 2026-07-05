import { registerNode } from './registry';
import { PmNode } from './types';

/**
 * Registers the common core nodes both twins agree on. SCAFFOLD: a couple of
 * trivial serializers to prove the registry seam compiles; the full set
 * (headings, lists, tables, code, callouts, diagrams…) is authored in the
 * fold-in against the golden fixtures.
 */
export function registerCommonNodes(): void {
  registerNode({
    type: 'paragraph',
    toDfm: (node: PmNode) => textOf(node) + '\n\n',
  });
  registerNode({
    type: 'text',
    toDfm: (node: PmNode) => node.text ?? '',
  });
}

function textOf(node: PmNode): string {
  if (typeof node.text === 'string') return node.text;
  if (!node.content) return '';
  return node.content.map(textOf).join('');
}
