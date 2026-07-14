// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-1437 — real Redis + BullMQ harness (testcontainers).
 *
 * CS §5 mocking strategy: Redis/BullMQ is remote-but-owned infra for this
 * story's assertion (§4f) — the DoD test must observe a REAL BullMQ queue's
 * job count, never a mock call-count on `Queue.add`. This harness starts one
 * `redis:7-alpine` container per test file and exposes a real `bullmq.Queue`
 * bound to it, matching the `db-test-harness.ts` (ENG-1372) convention for
 * Postgres.
 */
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Queue } from 'bullmq';

export interface TestQueue {
  queue: Queue;
  container: StartedTestContainer;
  teardown: () => Promise<void>;
}

export async function startTestQueue(queueName: string): Promise<TestQueue> {
  const container = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();

  const connection = {
    host: container.getHost(),
    port: container.getMappedPort(6379),
  };

  const queue = new Queue(queueName, { connection });

  return {
    queue,
    container,
    teardown: async () => {
      await queue.close();
      await container.stop();
    },
  };
}
