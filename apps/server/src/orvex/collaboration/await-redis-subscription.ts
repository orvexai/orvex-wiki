// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import Redis from 'ioredis';

/** Wait for Redis to acknowledge each channel subscription before startup. */
export async function awaitRedisSubscription(
  redis: Pick<Redis, 'subscribe'>,
  ...channels: string[]
): Promise<void> {
  await redis.subscribe(...channels);
}
