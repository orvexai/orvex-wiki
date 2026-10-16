// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.
import type { KafkaConfig } from 'kafkajs';

/**
 * platform-kafka's anonymous plaintext listener (:9092) was removed on
 * 2026-10-12; only the SCRAM-SHA-512 TLS listener (:9093) remains. Same env
 * contract as orvex-studio-billing's relay:
 *
 *   KAFKA_SASL_USERNAME / KAFKA_SASL_PASSWORD — the Strimzi KafkaUser's SCRAM
 *     credentials. Setting the username switches on SASL and TLS.
 *   KAFKA_TLS_CA_PEM — the Strimzi cluster CA (self-signed) to trust. Literal
 *     "\n" escapes are accepted for single-line env files.
 *
 * With none set the client stays plaintext/anonymous (local dev, CI broker).
 * Every kafkajs client in this service spreads this into its config, so the
 * relay, the entitlement consumer and the health probe can never disagree.
 */
export function kafkaSecurityFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Pick<KafkaConfig, 'ssl' | 'sasl'> {
  const username = env.KAFKA_SASL_USERNAME?.trim();
  const caRaw = env.KAFKA_TLS_CA_PEM?.trim();
  const ca = caRaw ? caRaw.replace(/\\n/g, '\n') : undefined;

  const out: Pick<KafkaConfig, 'ssl' | 'sasl'> = {};
  if (ca) {
    out.ssl = { ca: [ca] };
  }
  if (username) {
    const password = env.KAFKA_SASL_PASSWORD ?? '';
    if (!password) {
      throw new Error(
        'KAFKA_SASL_USERNAME is set but KAFKA_SASL_PASSWORD is empty',
      );
    }
    out.sasl = { mechanism: 'scram-sha-512', username, password };
    if (!out.ssl) out.ssl = true;
  }
  return out;
}
