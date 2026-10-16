import { kafkaSecurityFromEnv } from './kafka-client-security';

describe('kafkaSecurityFromEnv', () => {
  it('stays plaintext and anonymous when nothing is set', () => {
    expect(kafkaSecurityFromEnv({})).toEqual({});
  });

  it('enables SCRAM-SHA-512 over TLS with the cluster CA', () => {
    const out = kafkaSecurityFromEnv({
      KAFKA_SASL_USERNAME: 'orvex-wiki-crew-yafet',
      KAFKA_SASL_PASSWORD: 'pw',
      KAFKA_TLS_CA_PEM: '-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----',
    });
    expect(out.sasl).toEqual({
      mechanism: 'scram-sha-512',
      username: 'orvex-wiki-crew-yafet',
      password: 'pw',
    });
    expect(out.ssl).toEqual({
      ca: ['-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----'],
    });
  });

  it('uses system trust when SASL is set without a CA', () => {
    expect(
      kafkaSecurityFromEnv({ KAFKA_SASL_USERNAME: 'u', KAFKA_SASL_PASSWORD: 'p' })
        .ssl,
    ).toBe(true);
  });

  it('refuses a username without a password', () => {
    expect(() => kafkaSecurityFromEnv({ KAFKA_SASL_USERNAME: 'u' })).toThrow(
      /KAFKA_SASL_PASSWORD/,
    );
  });
});
