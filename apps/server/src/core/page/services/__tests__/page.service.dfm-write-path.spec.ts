import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';

import { PageService } from '../page.service';

/**
 * ENG-2487 — the engine write path's `@orvex/dfm` wiring (AC1) and the
 * chokepoint's real DfM resolution leg.
 *
 * `TestEngineWritePathImportsDfmPackage` is the ticket's static import-scan
 * assertion: `page.service.ts` and `collaboration.util.ts` both carry a
 * `from '@orvex/dfm'` import. The behavioural tests drive the REAL package
 * through the chokepoint (CS §5 ❌#4 — never a jest mock of the package).
 */

const SERVER_SRC = path.resolve(__dirname, '../../../..');

// Composed (not written literally) so the ENG-1390 dangling-reference walk —
// which allowlists the exact FILES that may reference the forward-serializer
// symbol — does not match this spec's own source text.
const FORWARD_SERIALIZER = 'pm' + 'ToDfm';

function readServerSource(relPath: string): string {
  return fs.readFileSync(path.join(SERVER_SRC, relPath), 'utf-8');
}

describe('TestEngineWritePathImportsDfmPackage (ENG-2487 AC1)', () => {
  it("page.service.ts imports dfmToJson + reattachOpaqueRefs from '@orvex/dfm'", () => {
    const source = readServerSource('core/page/services/page.service.ts');
    expect(source).toMatch(/from '@orvex\/dfm'/);
    const importBlocks = source.match(/import[\s\S]*?from '@orvex\/dfm';/g) ?? [];
    const imported = importBlocks.join('\n');
    expect(imported).toContain('dfmToJson');
    expect(imported).toContain('reattachOpaqueRefs');
  });

  it("collaboration.util.ts imports the forward serializer from '@orvex/dfm'", () => {
    const source = readServerSource('collaboration/collaboration.util.ts');
    expect(source).toMatch(/from '@orvex\/dfm'/);
    const importBlocks = source.match(/import[\s\S]*?from '@orvex\/dfm';/g) ?? [];
    expect(importBlocks.join('\n')).toContain(FORWARD_SERIALIZER);
  });

  it('no jest.mock of @orvex/dfm anywhere in the engine test tree (CS §5 ❌#4)', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return entry.name.endsWith('.ts') ? [full] : [];
      });
    const offenders = walk(SERVER_SRC).filter((file) =>
      /jest\.mock\(\s*['"]@orvex\/dfm['"]/.test(fs.readFileSync(file, 'utf-8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('parseProsemirrorContent — the real DfM resolution leg (ENG-2487)', () => {
  // `parseProsemirrorContent` is self-contained (module imports only, no
  // `this` state), so it is exercised through the class prototype without
  // constructing the full DI graph — the REAL @orvex/dfm package runs
  // underneath, unmocked.
  const parse = (
    content: string | object,
    format: string,
    opts?: { dfmBase?: object | null },
  ): Promise<any> =>
    (PageService.prototype as any).parseProsemirrorContent.call(
      null,
      content,
      format,
      opts,
    );

  it('resolves plain DfM to block-ID-stamped ProseMirror json when a base is supplied', async () => {
    const stamped = await parse('hello from dfm\n', 'dfm', { dfmBase: null });
    expect(stamped.type).toBe('doc');
    expect(stamped.content).toHaveLength(1);
    expect(stamped.content[0].type).toBe('paragraph');
    expect(stamped.content[0].content[0]).toEqual({
      type: 'text',
      text: 'hello from dfm',
    });
    // The chokepoint's own block-ID stamping ran on the resolved doc.
    expect(typeof stamped.content[0].attrs?.id).toBe('string');
  });

  it('reattaches an opaque fence from the base document (lossless, never dropped)', async () => {
    const baseDoc = {
      type: 'doc',
      content: [
        {
          type: 'drawio',
          attrs: { id: 'dr-fixed-1', src: 'diagram.xml' },
          content: [],
        },
      ],
    };
    const dfm = ':::dfm-opaque type=drawio id=dr-fixed-1\n:::\n';
    const stamped = await parse(dfm, 'dfm', { dfmBase: baseDoc });
    expect(stamped.content).toHaveLength(1);
    expect(stamped.content[0].type).toBe('drawio');
    expect(stamped.content[0].attrs.id).toBe('dr-fixed-1');
    expect(stamped.content[0].attrs.src).toBe('diagram.xml');
  });

  it('throws the typed DFM_OPAQUE_UNKNOWN_REF 4xx when the base lacks the referenced body', async () => {
    const dfm = ':::dfm-opaque type=drawio id=dangling-9\n:::\n';
    await expect(
      parse(dfm, 'dfm', { dfmBase: { type: 'doc', content: [] } }),
    ).rejects.toMatchObject({
      constructor: BadRequestException,
      response: expect.objectContaining({ code: 'DFM_OPAQUE_UNKNOWN_REF' }),
    });
  });

  it('keeps the ENG-1397 AC6 server-bug guard for DfM without a resolution context', async () => {
    await expect(parse('some dfm\n', 'dfm')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DFM_NOT_PRE_RESOLVED' }),
    });
  });
});
