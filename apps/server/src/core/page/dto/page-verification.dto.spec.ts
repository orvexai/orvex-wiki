// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { v7 as uuid7 } from 'uuid';
import { v4 as uuid4 } from 'uuid';
import { CreateVerificationDto, UpdateVerificationDto } from './page-verification.dto';

/**
 * ENG-1459 fix pass 1 — DTO validation gates hit by the review findings:
 *
 *  - real user ids are UUID v7 (gen_uuid_v7 in the schema); `verifierIds`
 *    must accept them, not just v4.
 *  - `fixedExpiresAt` must reject a non-date string at the pipe (clean 400)
 *    rather than falling through to `new Date(...)` -> Invalid Date -> a
 *    500 at insert.
 */
describe('CreateVerificationDto / UpdateVerificationDto validation', () => {
  const basePayload = {
    pageId: uuid4(),
    type: 'expiring',
    mode: 'period',
    periodAmount: 30,
    periodUnit: 'day',
  };

  it('accepts real v7 verifier ids on create', async () => {
    const dto = plainToInstance(CreateVerificationDto, {
      ...basePayload,
      verifierIds: [uuid7(), uuid7()],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts real v7 verifier ids on update', async () => {
    const dto = plainToInstance(UpdateVerificationDto, {
      pageId: uuid4(),
      verifierIds: [uuid7()],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('still rejects non-uuid verifier ids', async () => {
    const dto = plainToInstance(CreateVerificationDto, {
      ...basePayload,
      verifierIds: ['not-a-uuid'],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-date fixedExpiresAt on create (clean 400, not a 500 at insert)', async () => {
    const dto = plainToInstance(CreateVerificationDto, {
      ...basePayload,
      mode: 'fixed',
      fixedExpiresAt: 'not-a-date',
      verifierIds: [uuid7()],
    });
    const errors = await validate(dto);
    const properties = errors.map((e) => e.property);
    expect(properties).toContain('fixedExpiresAt');
  });

  it('accepts a valid ISO fixedExpiresAt on create', async () => {
    const dto = plainToInstance(CreateVerificationDto, {
      ...basePayload,
      mode: 'fixed',
      fixedExpiresAt: new Date().toISOString(),
      verifierIds: [uuid7()],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-date fixedExpiresAt on update', async () => {
    const dto = plainToInstance(UpdateVerificationDto, {
      pageId: uuid4(),
      fixedExpiresAt: 'not-a-date',
    });
    const errors = await validate(dto);
    const properties = errors.map((e) => e.property);
    expect(properties).toContain('fixedExpiresAt');
  });
});
