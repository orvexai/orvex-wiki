// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { SessionService } from '../session/session.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { OrvexSessionMintModule } from './orvex-session-mint.module';
import { OrvexSessionExchangeController } from './orvex-session-exchange.controller';
import { OrvexSessionMintService } from './orvex-session-mint.service';
import {
  IDENTITY_INTROSPECTOR,
  HttpIdentityIntrospector,
  NotConfiguredIntrospector,
} from './identity-introspector';

/**
 * DI-BOOT proof: `nest build` (tsc) does NOT resolve the Nest injection graph —
 * only compiling the module does. This asserts the real module wires the
 * controller + service + introspector from the @Global deps it does NOT import
 * (UserRepo/SessionService/EnvironmentService/AUDIT_SERVICE — the InternalApi
 * placement precedent), and that the introspector composition branches on
 * `ORVEX_IDENTITY_URL` (fail-closed when unset, real adapter when set).
 */
// The @Global providers this module relies on WITHOUT importing (in the real
// app: DatabaseModule/SessionModule/EnvironmentModule/audit are all @Global()).
// Simulated here as a @Global() stub module so the imported OrvexSessionMintModule
// resolves them from the global scope exactly as it does at runtime — the whole
// point of the boot proof (the InternalApi placement precedent).
@Global()
@Module({
  providers: [
    { provide: UserRepo, useValue: {} },
    { provide: SessionService, useValue: {} },
    { provide: EnvironmentService, useValue: {} },
    { provide: AUDIT_SERVICE, useValue: {} },
  ],
  exports: [UserRepo, SessionService, EnvironmentService, AUDIT_SERVICE],
})
class TestGlobalsModule {}

describe('OrvexSessionMintModule (DI boot)', () => {

  const savedIdentityUrl = process.env.ORVEX_IDENTITY_URL;
  afterEach(() => {
    if (savedIdentityUrl === undefined) {
      delete process.env.ORVEX_IDENTITY_URL;
    } else {
      process.env.ORVEX_IDENTITY_URL = savedIdentityUrl;
    }
  });

  it('resolves the controller + service, and composes the fail-closed introspector when ORVEX_IDENTITY_URL is unset', async () => {
    delete process.env.ORVEX_IDENTITY_URL;
    const moduleRef = await Test.createTestingModule({
      imports: [TestGlobalsModule, OrvexSessionMintModule],
    }).compile();

    expect(moduleRef.get(OrvexSessionExchangeController)).toBeInstanceOf(
      OrvexSessionExchangeController,
    );
    expect(moduleRef.get(OrvexSessionMintService)).toBeInstanceOf(
      OrvexSessionMintService,
    );
    expect(moduleRef.get(IDENTITY_INTROSPECTOR)).toBeInstanceOf(
      NotConfiguredIntrospector,
    );
    await moduleRef.close();
  });

  it('composes the real HTTP introspector when ORVEX_IDENTITY_URL is set', async () => {
    process.env.ORVEX_IDENTITY_URL = 'http://identity.local';
    const moduleRef = await Test.createTestingModule({
      imports: [TestGlobalsModule, OrvexSessionMintModule],
    }).compile();

    expect(moduleRef.get(IDENTITY_INTROSPECTOR)).toBeInstanceOf(
      HttpIdentityIntrospector,
    );
    await moduleRef.close();
  });
});
