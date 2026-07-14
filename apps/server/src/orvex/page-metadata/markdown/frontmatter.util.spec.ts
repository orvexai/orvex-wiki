import { extractFrontmatter, serializeFrontmatter } from './frontmatter.util';

describe('extractFrontmatter (ENG-1371 AC8)', () => {
  it('maps recognized snake_case keys onto camelCase metadata fields', () => {
    const md = `---\nstatus: canonical\ndoc_type: architecture\n---\nBody text.`;
    const { metadata, body, unknownKeys } = extractFrontmatter(md);

    expect(metadata).toEqual({ status: 'canonical', docType: 'architecture' });
    expect(body.trim()).toBe('Body text.');
    expect(unknownKeys).toEqual({});
  });

  it('routes a novel key to unknownKeys, preserved verbatim', () => {
    const md = `---\nstatus: draft\ncustom_novel_key: hello\n---\nBody.`;
    const { metadata, unknownKeys } = extractFrontmatter(md);

    expect(metadata).toEqual({ status: 'draft' });
    expect(unknownKeys).toEqual({ custom_novel_key: 'hello' });
  });

  it('returns empty metadata/unknownKeys for a body with no frontmatter', () => {
    const { metadata, unknownKeys, body } = extractFrontmatter('Just body text.');
    expect(metadata).toEqual({});
    expect(unknownKeys).toEqual({});
    expect(body.trim()).toBe('Just body text.');
  });
});

describe('serializeFrontmatter', () => {
  it('returns empty string when there is nothing to serialize', () => {
    expect(serializeFrontmatter({})).toBe('');
  });

  it('round-trips camelCase metadata + unknown keys back through extraction', () => {
    const serialized = serializeFrontmatter(
      { status: 'canonical', docType: 'adr' },
      { custom_novel_key: 'hello' },
    );
    const { metadata, unknownKeys } = extractFrontmatter(serialized + '\nBody.');
    expect(metadata).toEqual({ status: 'canonical', docType: 'adr' });
    expect(unknownKeys).toEqual({ custom_novel_key: 'hello' });
  });
});
