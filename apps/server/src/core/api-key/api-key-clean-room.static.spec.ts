import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * ENG-1380 — 5c determinism / contract gates. Pure static checks, no
 * runtime product code executed (CS §5c: a static gate, not a mock).
 */
describe('ApiKeyCleanRoomStaticGates', () => {
  const apiKeyDir = path.join(__dirname);
  // __dirname = apps/server/src/core/api-key -> three levels up is apps/server.
  const serverRoot = path.join(__dirname, '..', '..', '..');
  const selfFile = __filename;

  async function readAllTsFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await readAllTsFiles(full)));
      } else if (entry.name.endsWith('.ts') && full !== selfFile) {
        files.push(full);
      }
    }
    return files;
  }

  it('the EE api-key module does not exist in this tree (ENG-1381 precondition)', async () => {
    const eeApiKeyPath = path.join(serverRoot, 'src/ee/api-key');
    await expect(fs.stat(eeApiKeyPath)).rejects.toThrow();
  });

  it('no file under core/api-key carries EE lineage / a scope-mint catalog', async () => {
    const files = await readAllTsFiles(apiKeyDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      expect(content).not.toMatch(/Source: orvex enterprise module/);
      // AC11 — scope is a read-only marker; this leg mints no scope schema.
      expect(content).not.toMatch(/scope[-_ ]?(catalog|mint|schema)/i);
    }
  });

  it('jwt.strategy.ts no longer dynamic-require()s an EE path', async () => {
    const strategyPath = path.join(
      serverRoot,
      'src/core/auth/strategies/jwt.strategy.ts',
    );
    const content = await fs.readFile(strategyPath, 'utf-8');
    expect(content).not.toMatch(/require\(.*ee\/api-key/);
  });

  it('no `any` type-laundering across the api-key DTO boundary', async () => {
    const dtoPath = path.join(apiKeyDir, 'dto', 'api-key.dto.ts');
    const content = await fs.readFile(dtoPath, 'utf-8');
    expect(content).not.toMatch(/:\s*any\b/);
  });
});
