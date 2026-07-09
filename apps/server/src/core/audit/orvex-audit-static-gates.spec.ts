import * as fs from 'fs';
import * as path from 'path';

/**
 * ENG-1396 — static/determinism gates (AC5, AC8, honesty NFR). These are
 * grep-based CI gates asserted as jest specs so they run in the normal
 * test pipeline (`no-linear-audit-vocab`).
 */
describe('ENG-1396 static gates', () => {
  const auditFiles = [
    path.join(__dirname, 'orvex-audit.service.ts'),
    path.join(__dirname, '../../common/events/audit-events.ts'),
    path.join(__dirname, '../../orvex/audit/orvex-audit-actor.resolver.ts'),
  ].map((p) => fs.readFileSync(p, 'utf8'));

  it('AC5 — no LINEAR_* / linear.* audit event references remain', () => {
    for (const src of auditFiles) {
      expect(src).not.toMatch(/LINEAR_/);
      expect(src).not.toMatch(/'linear\./);
    }
  });

  it('AC8 — no Kafka producer import in this leg\'s audit code (publication is the outbox leg\'s job)', () => {
    for (const src of auditFiles) {
      expect(src.toLowerCase()).not.toMatch(/kafka/);
    }
  });

  it('AC8 — no cross-DB CASCADE FK added by the client_id migration (ruling 7)', () => {
    const migration = fs.readFileSync(
      path.join(
        __dirname,
        '../../database/migrations/20260709T110000-audit-client-id.ts',
      ),
      'utf8',
    );
    expect(migration).not.toMatch(/references\(/);
    expect(migration).not.toMatch(/on delete cascade/i);
  });

  it('honesty (CS §11) — no MOCK/placeholder audit-event constants', () => {
    for (const src of auditFiles) {
      expect(src).not.toMatch(/\bMOCK\b/);
      expect(src.toLowerCase()).not.toMatch(/placeholder/);
    }
  });
});
