// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import type { Span } from '@opentelemetry/api';

import {
  applySpanAttributes,
  buildResourceAttributes,
  buildSpanAttributes,
  ORVEX_CELL_ATTR,
  ORVEX_CORRELATION_ID_ATTR,
  ORVEX_TENANT_ATTR,
} from './orvex-span-attributes.util';

/**
 * ENG-1599 AC1/AC6 — unit, real pure functions (CS §5 mocking strategy: "In
 * process: test the real pure functions directly, no mock").
 */
describe('orvex-span-attributes', () => {
  describe('buildResourceAttributes', () => {
    it('carries service.name and the FR-C18 orvex.cell key (AC1)', () => {
      const attrs = buildResourceAttributes({ CELL_ID: 'eu1' });
      expect(attrs['service.name']).toBe('wiki');
      expect(attrs[ORVEX_CELL_ATTR]).toBe('eu1');
    });

    it('omits orvex.cell when CELL_ID is unset — never fabricated', () => {
      const attrs = buildResourceAttributes({});
      expect(attrs['service.name']).toBe('wiki');
      expect(attrs[ORVEX_CELL_ATTR]).toBeUndefined();
    });

    it('drops a CELL_ID value that looks like free-form content, not an opaque token', () => {
      const attrs = buildResourceAttributes({
        CELL_ID: 'not a real cell token with spaces',
      });
      expect(attrs[ORVEX_CELL_ATTR]).toBeUndefined();
    });
  });

  describe('buildSpanAttributes', () => {
    it('carries the opaque workspace id under orvex.tenant and correlation_id (AC1)', () => {
      const workspaceId = '9b2e4f6a-1c3d-4e5f-8a7b-0c1d2e3f4a5b';
      const correlationId = 'corr-abc123';
      const attrs = buildSpanAttributes({ workspaceId, correlationId });
      expect(attrs[ORVEX_TENANT_ATTR]).toBe(workspaceId);
      expect(attrs[ORVEX_CORRELATION_ID_ATTR]).toBe(correlationId);
    });

    it('AC6: a page-title/PII value fed as workspaceId is ABSENT from the attributes', () => {
      const pageTitlePii = 'Q3 Board Deck — Jane Doe salary review';
      const attrs = buildSpanAttributes({
        workspaceId: pageTitlePii,
        correlationId: 'corr-abc123',
      });
      expect(Object.values(attrs)).not.toContain(pageTitlePii);
      expect(attrs[ORVEX_TENANT_ATTR]).toBeUndefined();
    });

    it('AC6: a page-title/PII value fed as correlationId is ABSENT from the attributes', () => {
      const pageBodyPii = 'Patient diagnosis notes for John Smith, DOB 1990-01-01';
      const attrs = buildSpanAttributes({
        workspaceId: '9b2e4f6a-1c3d-4e5f-8a7b-0c1d2e3f4a5b',
        correlationId: pageBodyPii,
      });
      expect(Object.values(attrs)).not.toContain(pageBodyPii);
      expect(attrs[ORVEX_CORRELATION_ID_ATTR]).toBeUndefined();
    });

    it('omits both keys when neither input is provided — no fabricated values', () => {
      const attrs = buildSpanAttributes({});
      expect(attrs[ORVEX_TENANT_ATTR]).toBeUndefined();
      expect(attrs[ORVEX_CORRELATION_ID_ATTR]).toBeUndefined();
    });
  });

  describe('applySpanAttributes', () => {
    it('calls setAttributes on the span with the built bag', () => {
      const setAttributes = jest.fn();
      const span = { setAttributes } as unknown as Span;
      applySpanAttributes(span, { [ORVEX_TENANT_ATTR]: 'ws-1' });
      expect(setAttributes).toHaveBeenCalledWith({ [ORVEX_TENANT_ATTR]: 'ws-1' });
    });

    it('is a no-op when there is no active span (vanilla-safe, AC5)', () => {
      expect(() => applySpanAttributes(undefined, { a: '1' })).not.toThrow();
    });

    it('is a no-op when the attribute bag is empty', () => {
      const setAttributes = jest.fn();
      const span = { setAttributes } as unknown as Span;
      applySpanAttributes(span, {});
      expect(setAttributes).not.toHaveBeenCalled();
    });
  });
});
