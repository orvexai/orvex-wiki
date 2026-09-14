// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  isNativeLoginRemoved,
  isOrvexModulesEnabled,
} from './orvex-boot-flags';

describe('orvex boot flags', () => {
  const saved = {
    ORVEX_MODULES_ENABLED: process.env.ORVEX_MODULES_ENABLED,
    NATIVE_LOGIN_REMOVED: process.env.NATIVE_LOGIN_REMOVED,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it.each([
    ['isOrvexModulesEnabled', 'ORVEX_MODULES_ENABLED', isOrvexModulesEnabled],
    ['isNativeLoginRemoved', 'NATIVE_LOGIN_REMOVED', isNativeLoginRemoved],
  ] as const)(
    '%s is true only for the exact literal "true" of %s',
    (_name, key, read) => {
      delete process.env[key];
      expect(read()).toBe(false);

      for (const value of ['', 'false', 'TRUE', '1', ' true']) {
        process.env[key] = value;
        expect(read()).toBe(false);
      }

      process.env[key] = 'true';
      expect(read()).toBe(true);
    },
  );

  it('reads the environment on every call instead of caching it', () => {
    process.env.ORVEX_MODULES_ENABLED = 'true';
    process.env.NATIVE_LOGIN_REMOVED = 'true';
    expect(isOrvexModulesEnabled()).toBe(true);
    expect(isNativeLoginRemoved()).toBe(true);

    delete process.env.ORVEX_MODULES_ENABLED;
    process.env.NATIVE_LOGIN_REMOVED = 'false';
    expect(isOrvexModulesEnabled()).toBe(false);
    expect(isNativeLoginRemoved()).toBe(false);
  });
});
