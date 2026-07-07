import { describe, expect, it } from 'vitest';
import { createStore } from 'jotai';
import { EMPTY_SET, multiSelectAtomFamily } from '../atoms/multi-select.atom';

describe('multiSelectAtomFamily', () => {
  it('AC1: isolates selection by editorId — setting one leaves the other EMPTY_SET', () => {
    const store = createStore();
    const atomA = multiSelectAtomFamily({ editorId: 'a', surfaceKey: 's' });
    const atomB = multiSelectAtomFamily({ editorId: 'b', surfaceKey: 's' });

    expect(atomA).not.toBe(atomB);
    expect(store.get(atomA)).toBe(EMPTY_SET);
    expect(store.get(atomB)).toBe(EMPTY_SET);

    store.set(atomA, () => new Set(['item-1']));

    expect(store.get(atomA)).toEqual(new Set(['item-1']));
    expect(store.get(atomB)).toBe(EMPTY_SET);
  });

  it('AC2: isolates selection by surfaceKey on the same editor', () => {
    const store = createStore();
    const atomMentions = multiSelectAtomFamily({ editorId: 'a', surfaceKey: 'page-mention' });
    const atomAttachments = multiSelectAtomFamily({ editorId: 'a', surfaceKey: 'attachment' });

    expect(atomMentions).not.toBe(atomAttachments);

    store.set(atomMentions, () => new Set(['m-1']));

    expect(store.get(atomMentions)).toEqual(new Set(['m-1']));
    expect(store.get(atomAttachments)).toBe(EMPTY_SET);
  });

  it('AC2: equality fn returns the same atom only when both fields match', () => {
    const key1 = { editorId: 'a', surfaceKey: 's' };
    const key2 = { editorId: 'a', surfaceKey: 's' };
    const key3 = { editorId: 'a', surfaceKey: 'other' };

    expect(multiSelectAtomFamily(key1)).toBe(multiSelectAtomFamily(key2));
    expect(multiSelectAtomFamily(key1)).not.toBe(multiSelectAtomFamily(key3));
  });
});
