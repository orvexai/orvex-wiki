import { join } from 'path';
import { spawnSync } from 'child_process';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

/**
 * ENG-2479 NFR "never-white-screen equivalent" —
 * `TestMigrationFailureExitsProcessNonZero`.
 *
 * Confirms `MigrationService`'s existing `process.exit(1)`-on-error branch
 * (preserved verbatim by this ticket's AC1/AC2 changes) still fires on a
 * genuine migrator error, driven in an isolated child process (see the
 * fixture script's own docstring for why: an in-process `process.exit(1)`
 * would kill this Jest worker before any assertion could run).
 */
describe('MigrationFailureExitsSpec', () => {
  jest.setTimeout(120_000);

  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
  });

  afterAll(async () => {
    await container.stop();
  });

  it('exits the process with a non-zero code and logs the failure, rather than continuing to serve traffic', () => {
    const fixturePath = join(__dirname, 'fixtures/run-migrate-and-exit.ts');

    const result = spawnSync(
      'npx',
      ['tsx', fixturePath],
      {
        cwd: join(__dirname, '../../../../'), // apps/server
        env: {
          ...process.env,
          DATABASE_URL: container.getConnectionUri(),
        },
        encoding: 'utf8',
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.status).not.toBeNull();
    expect(result.stdout).not.toContain('ENG-2479-FIXTURE-UNEXPECTED-SUCCESS');
    expect(result.stdout).not.toContain('ENG-2479-FIXTURE-UNCAUGHT');
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toMatch(
      /Failed to run database migration\. Exiting program\./,
    );
  });
});
