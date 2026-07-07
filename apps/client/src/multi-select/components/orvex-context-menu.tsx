import {
  cloneElement,
  isValidElement,
  useCallback,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from 'react';
import type { OrvexContextMenuItem } from '../types/multi-select.types';

export interface OrvexContextMenuProps {
  children: ReactElement;
  items: OrvexContextMenuItem[];
}

interface MenuPosition {
  x: number;
  y: number;
}

function renderItems(items: OrvexContextMenuItem[], onClose: () => void): React.ReactNode {
  return items.map((item, index) => {
    switch (item.kind) {
      case 'divider':
        return <div key={index} role="separator" data-orvex-menu-divider />;
      case 'label':
        return (
          <div key={index} role="presentation" data-orvex-menu-label>
            {item.label}
          </div>
        );
      case 'submenu':
        return (
          <div key={item.id} role="none" data-orvex-menu-submenu>
            <div role="presentation">{item.label}</div>
            <div data-orvex-menu-submenu-items>{renderItems(item.items, onClose)}</div>
          </div>
        );
      case 'action':
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            data-orvex-menu-item={item.id}
            onClick={() => {
              // AC5: generic onClick fires first, then onSelect.
              item.onClick?.();
              item.onSelect();
              onClose();
            }}
          >
            {item.label}
          </button>
        );
      default:
        return null;
    }
  });
}

/**
 * Wraps `children` with a right-click context menu: prevents the browser's
 * default menu (even for an empty `items` array) and renders the
 * discriminated-union `items` (AC5). Platform-generic and surface-agnostic.
 */
export function OrvexContextMenu({ children, items }: OrvexContextMenuProps) {
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const close = useCallback(() => setPosition(null), []);

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      setPosition({ x: event.clientX, y: event.clientY });
      const childProps = children.props as { onContextMenu?: (e: typeof event) => void };
      childProps.onContextMenu?.(event);
    },
    [children],
  );

  const child = isValidElement(children)
    ? cloneElement(children, { onContextMenu: handleContextMenu } as Record<string, unknown>)
    : children;

  return (
    <>
      {child}
      {position ? (
        <div
          role="menu"
          data-orvex-context-menu
          style={{ position: 'fixed', top: position.y, left: position.x }}
        >
          {renderItems(items, close)}
        </div>
      ) : null}
    </>
  );
}
