import * as crypto from 'crypto';
import { Readable } from 'stream';
import { createHashedByteCountingStream } from '../utils';

/**
 * ENG-1398 AC5 — `createHashedByteCountingStream` known-input hash test.
 *
 * In-process `Transform` — no I/O, no mocking (CS §5): feed a real
 * `Readable`, assert against the real `crypto.createHash('sha256')`
 * reference digest and the exact byte length (CS §11 — no stub hash).
 */
describe('createHashedByteCountingStream', () => {
  it('returns the sha256 hex digest and byte count for a known input', async () => {
    const input = Buffer.from(
      'ENG-1398 attachment content used to exercise the hashed byte-counting stream.',
      'utf-8',
    );
    const expectedHash = crypto
      .createHash('sha256')
      .update(input)
      .digest('hex');

    const source = Readable.from([input]);
    const { stream, getHash, getBytesRead } =
      createHashedByteCountingStream(source);

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }

    expect(Buffer.concat(chunks).equals(input)).toBe(true);
    expect(getHash()).toBe(expectedHash);
    expect(getBytesRead()).toBe(input.length);
  });

  it('produces a real sha256 digest, not a placeholder (CS §11 honesty)', async () => {
    const input = Buffer.from('a');
    const source = Readable.from([input]);
    const { stream, getHash } = createHashedByteCountingStream(source);

    for await (const _chunk of stream) {
      // drain
    }

    // sha256('a') is a well-known reference digest.
    expect(getHash()).toBe(
      'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    );
  });
});
