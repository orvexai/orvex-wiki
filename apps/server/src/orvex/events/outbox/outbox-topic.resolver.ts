// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-3790 — resolve the wiki outbox topic from the environment-specific
 * provisioned configuration. CELL_ID is the CloudEvents cell stamp, not a
 * topic-routing key: prod and dev share a broker and may use the same cell id.
 *
 * A missing topic is a configuration error. Failing closed keeps the relay
 * from publishing to an invented topic and makes the deployment wiring
 * problem observable.
 */
export function resolveWikiEventsTopic(configuredTopic: string | null): string {
  const topic = configuredTopic?.trim();
  if (!topic) {
    throw new Error(
      'KAFKA_OUTBOX_TOPIC is required; the wiki outbox topic must be provisioned and configured explicitly',
    );
  }
  return topic;
}
