// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { SessionService } from '../session/session.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import {
  OrvexEdgeNotConfiguredError,
  OrvexSessionMintModule,
} from './orvex-session-mint.module';
import { OrvexSessionExchangeController } from './orvex-session-exchange.controller';
import { OrvexSessionMintService } from './orvex-session-mint.service';
import {
  IDENTITY_INTROSPECTOR,
  HttpIdentityIntrospector,
  NotConfiguredIntrospector,
} from './identity-introspector';
import { EDGE_ASSERTION_VERIFIER } from '../../orvex/edge-auth/edge-auth.module';
import { EdgeAssertionVerifier } from '../../orvex/edge-auth/edge-assertion-verifier';

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

  const savedEnv = {
    ORVEX_IDENTITY_URL: process.env.ORVEX_IDENTITY_URL,
    ORVEX_EDGE_ISSUER: process.env.ORVEX_EDGE_ISSUER,
    ORVEX_EDGE_JWKS_URL: process.env.ORVEX_EDGE_JWKS_URL,
  };
  // Deterministic edge composition: default every test to the UNCONFIGURED edge
  // seam; the edge-specific tests set the two vars explicitly before compile.
  beforeEach(() => {
    delete process.env.ORVEX_EDGE_ISSUER;
    delete process.env.ORVEX_EDGE_JWKS_URL;
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
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

  it('composes the FAIL-CLOSED edge verifier when ORVEX_EDGE_ISSUER/ORVEX_EDGE_JWKS_URL are unset (rejects with NOT_CONFIGURED, never a real verifier)', async () => {
    delete process.env.ORVEX_IDENTITY_URL;
    // (beforeEach already cleared the two edge vars)
    const moduleRef = await Test.createTestingModule({
      imports: [TestGlobalsModule, OrvexSessionMintModule],
    }).compile();

    const verifier = moduleRef.get(EDGE_ASSERTION_VERIFIER);
    expect(verifier).not.toBeInstanceOf(EdgeAssertionVerifier);
    await expect(verifier.verify('any.jws')).rejects.toBeInstanceOf(
      OrvexEdgeNotConfiguredError,
    );
    await moduleRef.close();
  });

  it('composes the REAL generic ES256 edge verifier when both edge vars are set', async () => {
    process.env.ORVEX_EDGE_ISSUER =
      'https://identity.edge.orvex.internal/edge-authn';
    process.env.ORVEX_EDGE_JWKS_URL =
      'http://orvex-studio-identity.orvex-studio-identity.svc.cluster.local/internal/jwks';
    const moduleRef = await Test.createTestingModule({
      imports: [TestGlobalsModule, OrvexSessionMintModule],
    }).compile();

    expect(moduleRef.get(EDGE_ASSERTION_VERIFIER)).toBeInstanceOf(
      EdgeAssertionVerifier,
    );
    await moduleRef.close();
  });
});
