// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import Redis from 'ioredis';

/**
 * Adapter for the upstream RedisSyncExtension's private subscriber. Upstream
 * currently names this ioredis client `sub` but exposes no subscription-ready
 * hook. Keep that dependency here so a shape change fails at startup with a
 * clear error instead of silently restoring the teardown race.
 */
export async function awaitRedisSyncSubscription(
  extension: unknown,
  ...channels: string[]
): Promise<void> {
  const subscriber = (extension as { sub?: unknown } | null)?.sub;
  if (
    !subscriber ||
    typeof (subscriber as Pick<Redis, 'subscribe'>).subscribe !== 'function'
  ) {
    throw new Error(
      'RedisSyncExtension subscriber adapter expected an ioredis client at `sub`; upstream shape changed',
    );
  }

  await (subscriber as Pick<Redis, 'subscribe'>).subscribe(...channels);
}
