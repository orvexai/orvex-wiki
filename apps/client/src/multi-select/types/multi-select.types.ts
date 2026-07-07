/**
 * Multi-select + context-menu primitive — shared types.
 *
 * Platform-generic (surface-agnostic; ENG-1408). `surfaceKey` is a
 * free-form string; documented consumers are `page-mention | subpages |
 * attachment | chat-history`, but any string is accepted.
 */

/** Identity of one multi-select scope: an editor instance + a surface within it. */
export interface MultiSelectKey {
  editorId: string;
  surfaceKey: string;
}

/** The selected item ids for a given `MultiSelectKey`. */
export type MultiSelectValue = ReadonlySet<string>;

export interface OrvexContextMenuItemAction {
  kind: 'action';
  id: string;
  label: string;
  onSelect: () => void;
  /** Optional generic click handler, invoked before `onSelect` (AC5). */
  onClick?: () => void;
  disabled?: boolean;
}

export interface OrvexContextMenuItemDivider {
  kind: 'divider';
}

export interface OrvexContextMenuItemLabel {
  kind: 'label';
  label: string;
}

export interface OrvexContextMenuItemSubmenu {
  kind: 'submenu';
  id: string;
  label: string;
  items: OrvexContextMenuItem[];
}

export type OrvexContextMenuItem =
  | OrvexContextMenuItemAction
  | OrvexContextMenuItemDivider
  | OrvexContextMenuItemLabel
  | OrvexContextMenuItemSubmenu;
