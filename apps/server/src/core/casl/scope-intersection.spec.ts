import * as fs from 'fs';
import * as path from 'path';
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import {
  ISpaceAbility,
  SpaceCaslAction,
  SpaceCaslSubject,
} from './interfaces/space-ability.type';
import {
  intersectWithTokenScope,
  stampTokenScope,
  TOKEN_SCOPE_SYMBOL,
} from './scope-intersection';

function buildReadWriteAbility(): MongoAbility<ISpaceAbility> {
  const { can, build } = new AbilityBuilder<MongoAbility<ISpaceAbility>>(
    createMongoAbility,
  );
  can(SpaceCaslAction.Manage, SpaceCaslSubject.Page);
  return build();
}

/**
 * ENG-1454 — `ScopeIntersectionEnforcementSpec` (pure/unit half).
 *
 * The named binary DoD gate for this ticket. Covers (a) the intersection
 * never-wider floor, (c) symbol encapsulation, and the AC7 empty/absent
 * edges. (b) escalation-guard and (d) jsonb round-trip are covered by the
 * sibling integration spec (`scope-intersection.integration.spec.ts`),
 * which needs a real Postgres.
 */
describe('ScopeIntersectionEnforcementSpec', () => {
  const S1 = 'space-1';
  const S2 = 'space-2';

  // AC1 — never exceeds the creator grant.
  it('(a) read-only + [S1] scope intersected with a read-write creator ability yields read-only-in-S1, never wider', () => {
    const creatorAbilityS1 = buildReadWriteAbility();
    const creatorAbilityS2 = buildReadWriteAbility();
    const user = stampTokenScope(
      {},
      { readOnly: true, spaceIds: [S1] },
    );

    const effectiveS1 = intersectWithTokenScope(creatorAbilityS1, S1, user);
    expect(effectiveS1.can(SpaceCaslAction.Read, SpaceCaslSubject.Page)).toBe(
      true,
    );
    expect(
      effectiveS1.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page),
    ).toBe(false);

    const effectiveS2 = intersectWithTokenScope(creatorAbilityS2, S2, user);
    expect(effectiveS2.can(SpaceCaslAction.Read, SpaceCaslSubject.Page)).toBe(
      false,
    );
  });

  // AC2 — symbol encapsulation: no other file may read the symbol.
  it('(c) TOKEN_SCOPE_SYMBOL is read only inside this module', () => {
    expect(typeof TOKEN_SCOPE_SYMBOL).toBe('symbol');

    const srcRoot = path.resolve(__dirname, '..', '..');
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) {
          continue;
        }
        if (full === path.resolve(__dirname, 'scope-intersection.ts')) {
          continue; // the module itself is allowed to read it.
        }
        const contents = fs.readFileSync(full, 'utf8');
        if (contents.includes('TOKEN_SCOPE_SYMBOL')) {
          offenders.push(path.relative(srcRoot, full));
        }
      }
    };
    walk(srcRoot);

    expect(offenders).toEqual([]);
  });

  it('absent symbol (session/legacy user) yields the full, unrestricted creator ability (AC7)', () => {
    const ability = buildReadWriteAbility();
    const sessionUser = {};

    const effective = intersectWithTokenScope(ability, S1, sessionUser);

    expect(effective.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page)).toBe(
      true,
    );
  });

  it('an explicitly empty scope yields no ability at all — the intersection of nothing is nothing (AC7)', () => {
    const ability = buildReadWriteAbility();
    const user = stampTokenScope({}, { readOnly: false, spaceIds: [] });

    const effective = intersectWithTokenScope(ability, S1, user);

    expect(effective.can(SpaceCaslAction.Read, SpaceCaslSubject.Page)).toBe(
      false,
    );
    expect(effective.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page)).toBe(
      false,
    );
  });

  it('a full (non-restricted) scope with no space allowlist leaves the creator ability untouched', () => {
    const ability = buildReadWriteAbility();
    const user = stampTokenScope({}, { readOnly: false, spaceIds: null });

    const effective = intersectWithTokenScope(ability, S1, user);

    expect(effective.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page)).toBe(
      true,
    );
  });
});
