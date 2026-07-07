import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OrvexContextMenu } from '../components/orvex-context-menu';
import type { OrvexContextMenuItem } from '../types/multi-select.types';

describe('OrvexContextMenu', () => {
  it('AC5: prevents the browser default menu even with an empty items array', () => {
    render(
      <OrvexContextMenu items={[]}>
        <div data-testid="target">target</div>
      </OrvexContextMenu>,
    );

    const target = screen.getByTestId('target');
    const event = fireEvent.contextMenu(target);

    // testing-library returns `false` from fireEvent when preventDefault was called.
    expect(event).toBe(false);
  });

  it('AC5: renders discriminated-union items by kind; onClick fires then onSelect', () => {
    const onClick = vi.fn();
    const onSelect = vi.fn();
    const calls: string[] = [];
    onClick.mockImplementation(() => calls.push('onClick'));
    onSelect.mockImplementation(() => calls.push('onSelect'));

    const items: OrvexContextMenuItem[] = [
      { kind: 'label', label: 'Actions' },
      { kind: 'action', id: 'a1', label: 'Do it', onClick, onSelect },
      { kind: 'divider' },
      {
        kind: 'submenu',
        id: 's1',
        label: 'More',
        items: [{ kind: 'action', id: 'a2', label: 'Nested', onSelect: vi.fn() }],
      },
    ];

    render(
      <OrvexContextMenu items={items}>
        <div data-testid="target">target</div>
      </OrvexContextMenu>,
    );

    fireEvent.contextMenu(screen.getByTestId('target'));

    expect(screen.getByText('Actions')).not.toBeNull();
    expect(screen.getByText('More')).not.toBeNull();
    expect(screen.getByText('Nested')).not.toBeNull();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Do it' }));

    expect(calls).toEqual(['onClick', 'onSelect']);
  });
});
