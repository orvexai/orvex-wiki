import {
  resolveWikiOutboxEventType,
  WIKI_ACCOUNT_DELETION_EVENT_TYPES,
} from './outbox-event-type.resolver';

describe('resolveWikiOutboxEventType', () => {
  it('preserves the exact account-deletion acknowledgement and resumable types', () => {
    expect(WIKI_ACCOUNT_DELETION_EVENT_TYPES.map(resolveWikiOutboxEventType)).toEqual(
      WIKI_ACCOUNT_DELETION_EVENT_TYPES,
    );
  });

  it('continues to prefix ordinary Wiki catalog types', () => {
    expect(resolveWikiOutboxEventType('workspace.member_added')).toBe(
      'wiki.workspace.member_added',
    );
  });

  it('rejects every other identity event type', () => {
    expect(() =>
      resolveWikiOutboxEventType('identity.account.deletion.unapproved'),
    ).toThrow('Unsupported identity outbox event type');
  });
});
