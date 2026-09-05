import { resolveWikiEventsTopic } from './outbox-topic.resolver';

describe('resolveWikiEventsTopic (ENG-3790)', () => {
  it('returns the configured provisioned topic without deriving from CELL_ID', () => {
    expect(resolveWikiEventsTopic('wiki-events.eu-central-1')).toBe(
      'wiki-events.eu-central-1',
    );
    expect(resolveWikiEventsTopic('wiki-events.dev.eu-central-1')).toBe(
      'wiki-events.dev.eu-central-1',
    );
  });

  it('keeps prod and dev topics distinct when their CELL_ID values could match', () => {
    const prodTopic = resolveWikiEventsTopic('wiki-events.eu-central-1');
    const devTopic = resolveWikiEventsTopic('wiki-events.dev.eu-central-1');

    expect(prodTopic).not.toBe(devTopic);
  });

  it('fails closed when KAFKA_OUTBOX_TOPIC is missing', () => {
    expect(() => resolveWikiEventsTopic(null)).toThrow(
      'KAFKA_OUTBOX_TOPIC is required',
    );
  });
});
