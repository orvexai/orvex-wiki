import { useAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import {
  EMPTY_SET,
  multiSelectAnchorAtomFamily,
  multiSelectAtomFamily,
} from '../atoms/multi-select.atom';
import type { MultiSelectKey, MultiSelectValue } from '../types/multi-select.types';

const DEFAULT_MAX_SELECTED = 100;
const CAP_WARNING_NOTIFICATION_ID = 'orvex-multi-select-cap-warning';

export type KeyboardScope = HTMLElement | { current: HTMLElement | null } | null | undefined;

export interface UseOrvexMultiSelectOptions {
  /** Ordering used to resolve shift-click / range selection (AC3, AC4). */
  itemsOrder: string[];
  /** Soft cap on selection size. `0` disables all mutations. Default 100. */
  maxSelected?: number;
  /** Element (or ref to one) that owns the Esc/Arrow/Space keyboard handling (AC6). */
  keyboardScope?: KeyboardScope;
}

export interface UseOrvexMultiSelectResult {
  selected: MultiSelectValue;
  isSelected: (id: string) => boolean;
  /** Toggle a single item's membership. Sets it as the new range anchor. */
  toggle: (id: string) => void;
  /** Select the inclusive range from the current anchor to `id`. ADDS only — never subtracts. */
  range: (id: string) => void;
  /** Clear all selection then select only `id`, resetting the anchor to it. */
  selectOne: (id: string) => void;
  /** Empty the selection and reset the anchor. */
  clear: () => void;
}

function resolveHost(scope: KeyboardScope): HTMLElement | null {
  if (!scope) return null;
  if (scope instanceof HTMLElement) return scope;
  return scope.current ?? null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true;
  if (target.isContentEditable && !target.hasAttribute('data-orvex-selectable')) return true;
  return false;
}

/**
 * Generic, editor-scoped multi-select behaviour: selection state (via
 * `multiSelectAtomFamily`), soft-cap enforcement, and Esc/Arrow/Space
 * keyboard wiring. Surface-agnostic; carries no product-specific coupling (ENG-1408 / AC7).
 */
export function useOrvexMultiSelect(
  editorId: string,
  surfaceKey: string,
  options: UseOrvexMultiSelectOptions,
): UseOrvexMultiSelectResult {
  const { itemsOrder, keyboardScope } = options;
  const maxSelected = options.maxSelected ?? DEFAULT_MAX_SELECTED;
  const { t } = useTranslation();

  const key: MultiSelectKey = useMemo(
    () => ({ editorId, surfaceKey }),
    [editorId, surfaceKey],
  );
  const selectionAtom = useMemo(() => multiSelectAtomFamily(key), [key]);
  const anchorAtom = useMemo(() => multiSelectAnchorAtomFamily(key), [key]);

  const [selected, setSelected] = useAtom(selectionAtom);
  const [anchor, setAnchor] = useAtom(anchorAtom);

  // Refs so the returned actions stay stable-ref across renders (CS §10 —
  // avoid re-render storms) without reading stale option/anchor values.
  // Synced in an effect (not during render) — mutating refs during render
  // is a react-hooks/refs violation.
  const itemsOrderRef = useRef(itemsOrder);
  const maxSelectedRef = useRef(maxSelected);
  const anchorRef = useRef(anchor);
  useEffect(() => {
    itemsOrderRef.current = itemsOrder;
    maxSelectedRef.current = maxSelected;
    anchorRef.current = anchor;
  });

  const warnCapOnce = useCallback(() => {
    notifications.show({
      id: CAP_WARNING_NOTIFICATION_ID,
      color: 'yellow',
      message: t('You can select up to {{max}} items at a time', {
        max: maxSelectedRef.current,
      }),
    });
  }, [t]);

  const toggle = useCallback(
    (id: string) => {
      if (maxSelectedRef.current === 0) return;
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(id)) {
          next.delete(id);
        } else {
          if (next.size >= maxSelectedRef.current) {
            warnCapOnce();
            return current;
          }
          next.add(id);
        }
        return next;
      });
      setAnchor(id);
    },
    [setSelected, setAnchor, warnCapOnce],
  );

  const range = useCallback(
    (id: string) => {
      if (maxSelectedRef.current === 0) return;
      const order = itemsOrderRef.current;
      const anchorId = anchorRef.current ?? id;
      const anchorIndex = order.indexOf(anchorId);
      const targetIndex = order.indexOf(id);
      if (anchorIndex === -1 || targetIndex === -1) return;

      const [start, end] =
        anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
      const rangeIds = order.slice(start, end + 1);

      let cappedOnce = false;
      setSelected((current) => {
        // Range only ever ADDS (Apple-HIG semantics) — never subtracts
        // existing selection (AC3).
        const next = new Set(current);
        for (const rangeId of rangeIds) {
          if (next.has(rangeId)) continue;
          if (next.size >= maxSelectedRef.current) {
            cappedOnce = true;
            break;
          }
          next.add(rangeId);
        }
        return next.size === current.size && cappedOnce === false ? current : next;
      });
      if (cappedOnce) {
        warnCapOnce();
      }
      if (anchorRef.current === null) {
        setAnchor(anchorId);
      }
    },
    [setSelected, setAnchor, warnCapOnce],
  );

  const selectOne = useCallback(
    (id: string) => {
      if (maxSelectedRef.current === 0) return;
      setSelected(() => new Set([id]));
      setAnchor(id);
    },
    [setSelected, setAnchor],
  );

  const clear = useCallback(() => {
    setSelected(() => EMPTY_SET);
    setAnchor(null);
  }, [setSelected, setAnchor]);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  // Esc clears; Arrow moves focus between `data-orvex-selectable` items
  // (skipping inputs/textareas/untagged contenteditable); Space toggles the
  // focused item (AC6). Installed only when a keyboardScope host is given.
  useEffect(() => {
    const host = resolveHost(keyboardScope);
    if (!host) return;

    function selectableElements(): HTMLElement[] {
      return Array.from(host!.querySelectorAll<HTMLElement>('[data-orvex-selectable]'));
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;

      if (e.key === 'Escape') {
        clear();
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = selectableElements();
        if (items.length === 0) return;
        const activeIndex = items.findIndex((el) => el === document.activeElement);
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const nextIndex =
          activeIndex === -1
            ? delta === 1
              ? 0
              : items.length - 1
            : Math.min(Math.max(activeIndex + delta, 0), items.length - 1);
        items[nextIndex]?.focus();
        e.preventDefault();
        return;
      }

      if (e.key === ' ' || e.key === 'Spacebar') {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.hasAttribute('data-orvex-selectable')) {
          const id = active.getAttribute('data-orvex-selectable');
          if (id) {
            toggle(id);
            e.preventDefault();
          }
        }
      }
    }

    host.addEventListener('keydown', handleKeyDown);
    return () => host.removeEventListener('keydown', handleKeyDown);
  }, [keyboardScope, clear, toggle]);

  return useMemo(
    () => ({ selected, isSelected, toggle, range, selectOne, clear }),
    [selected, isSelected, toggle, range, selectOne, clear],
  );
}

/** Localized live-region string for screen readers (AC6, CS §10 operability). */
export function useOrvexMultiSelectAnnouncer(size: number): string {
  const { t } = useTranslation();
  return t('{{n}} items selected', { n: size });
}
