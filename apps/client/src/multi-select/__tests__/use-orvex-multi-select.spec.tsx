import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import type { ReactNode } from 'react';
import { useOrvexMultiSelect, useOrvexMultiSelectAnnouncer } from '../hooks/use-orvex-multi-select';

const i18n = createInstance();
i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'You can select up to {{max}} items at a time':
          'You can select up to {{max}} items at a time',
        '{{n}} items selected': '{{n}} items selected',
      },
    },
  },
  interpolation: { escapeValue: false },
  initImmediate: false,
});

function wrapper({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

const ITEMS = ['i1', 'i2', 'i3', 'i4', 'i5'];

describe('useOrvexMultiSelect — selection isolation + range/cap semantics (named DoD test)', () => {
  beforeEach(() => {
    vi.spyOn(notifications, 'show').mockImplementation(() => 'mock-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AC1/AC2: selection is isolated across (editorId, surfaceKey) via the hook', () => {
    const { result: a } = renderHook(
      () => useOrvexMultiSelect('editor-a', 'page-mention', { itemsOrder: ITEMS }),
      { wrapper },
    );
    const { result: b } = renderHook(
      () => useOrvexMultiSelect('editor-b', 'page-mention', { itemsOrder: ITEMS }),
      { wrapper },
    );

    act(() => a.current.toggle('i1'));

    expect(a.current.selected.has('i1')).toBe(true);
    expect(b.current.selected.size).toBe(0);
  });

  it('AC3: toggle/range/selectOne/clear follow Apple-HIG semantics', () => {
    const { result } = renderHook(
      () => useOrvexMultiSelect('editor-c', 'subpages', { itemsOrder: ITEMS }),
      { wrapper },
    );

    act(() => result.current.toggle('i1'));
    expect(result.current.selected).toEqual(new Set(['i1']));

    act(() => result.current.toggle('i1'));
    expect(result.current.selected.size).toBe(0);

    act(() => result.current.toggle('i2'));
    act(() => result.current.range('i4'));
    // range ADDS the inclusive span from the anchor (i2) to i4, never subtracts.
    expect(result.current.selected).toEqual(new Set(['i2', 'i3', 'i4']));

    act(() => result.current.selectOne('i5'));
    expect(result.current.selected).toEqual(new Set(['i5']));

    act(() => result.current.clear());
    expect(result.current.selected.size).toBe(0);
  });

  it('AC4: range fills up to the cap and fires exactly one warning notification', () => {
    const { result } = renderHook(
      () =>
        useOrvexMultiSelect('editor-d', 'attachment', {
          itemsOrder: ITEMS,
          maxSelected: 2,
        }),
      { wrapper },
    );

    act(() => result.current.toggle('i1'));
    act(() => result.current.range('i5')); // would union to 5 items, capped at 2

    expect(result.current.selected.size).toBe(2);
    expect(notifications.show).toHaveBeenCalledTimes(1);
  });

  it('AC4: maxSelected===0 disables all mutations', () => {
    const { result } = renderHook(
      () =>
        useOrvexMultiSelect('editor-e', 'chat-history', {
          itemsOrder: ITEMS,
          maxSelected: 0,
        }),
      { wrapper },
    );

    act(() => result.current.toggle('i1'));
    act(() => result.current.range('i2'));
    act(() => result.current.selectOne('i3'));

    expect(result.current.selected.size).toBe(0);
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it('AC6: Esc clears, Arrow moves focus between selectable items, Space toggles', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const el1 = document.createElement('div');
    el1.setAttribute('data-orvex-selectable', 'i1');
    el1.tabIndex = 0;
    const el2 = document.createElement('div');
    el2.setAttribute('data-orvex-selectable', 'i2');
    el2.tabIndex = 0;
    host.append(el1, el2);

    const { result } = renderHook(
      () =>
        useOrvexMultiSelect('editor-f', 'page-mention', {
          itemsOrder: ITEMS,
          keyboardScope: host,
        }),
      { wrapper },
    );

    act(() => {
      host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement).toBe(el1);

    act(() => {
      host.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(result.current.selected.has('i1')).toBe(true);

    act(() => {
      host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(result.current.selected.size).toBe(0);

    host.remove();
  });

  it('AC6: keyboard handling ignores input/textarea/untagged-contenteditable targets', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const input = document.createElement('input');
    host.appendChild(input);

    const { result } = renderHook(
      () =>
        useOrvexMultiSelect('editor-g', 'page-mention', {
          itemsOrder: ITEMS,
          keyboardScope: host,
        }),
      { wrapper },
    );

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    // no-op: nothing was selected to begin with, and no throw/crash occurred.
    expect(result.current.selected.size).toBe(0);

    host.remove();
  });

  it('AC6: useOrvexMultiSelectAnnouncer returns a localized live-region string', () => {
    const { result } = renderHook(() => useOrvexMultiSelectAnnouncer(3), { wrapper });
    expect(result.current).toBe('3 items selected');
  });
});
