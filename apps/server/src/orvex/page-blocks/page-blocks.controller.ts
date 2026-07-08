// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * page-blocks.controller.ts (engine leg, ENG-1412)
 *
 * This file intentionally holds ONLY the handler registry (handlerRegistry +
 * registerBlockHandler + the BlockHandler type) — NOT the HTTP write-grammar
 * controller (POST :type / PATCH :blockId / DELETE :blockId etc).
 *
 * po-ruling 10: the engine (this repo) owns the block-schema CATALOG; the
 * block-PATCH WRITE grammar over it is the separate `orvex-wiki-api` leg,
 * blocked-by `blockid-chokepoint-engine`. The file/module name and the
 * `registerBlockHandler` signature are kept identical to the pinned fork
 * source (orvexai/docmost @ 050187676624f2395c55b36ec60e365f87fd4a9f) so the
 * ported handler-schema registration files below import from the same path,
 * and so the future write-grammar leg can extend this registry in place
 * rather than re-deriving it.
 *
 * The duplicate-registration guard is the only ENG-1412 AC5 requirement this
 * file needs to satisfy; the full PageBlocksController (PageBlocksService,
 * DTOs, PATCH/POST/DELETE routes) is deliberately NOT ported here.
 */

/**
 * BlockHandler is the per-type handler function a future write-grammar leg
 * registers. Left loose (unknown[] => Promise<object>) here since this leg
 * does not define PageBlocksService/User/DTO types — those belong to the
 * write-grammar leg.
 */
export type BlockHandler = (...args: unknown[]) => Promise<object>;

/**
 * handlerRegistry maps embed type names to their handler functions.
 * Populated at module-load time by handler packages calling
 * registerBlockHandler() from their module's static registration path.
 *
 * DA-028: This is a module-level Map. NestJS bootstraps in a single-threaded
 * Node.js event loop; all module initialisation (and therefore all
 * registerBlockHandler() calls) happens synchronously before any request is
 * served. Concurrent registration races are therefore impossible.
 */
const handlerRegistry = new Map<string, BlockHandler>();

/**
 * registerBlockHandler adds a handler for an embed type.
 * Call once per type from the embed package's module-init path.
 * Throws on duplicate registration — caught at startup.
 */
export function registerBlockHandler(type: string, handler: BlockHandler): void {
  if (handlerRegistry.has(type)) {
    throw new Error(
      `😱 page-blocks: handler already registered for type "${type}" — each embed type must be registered exactly once`,
    );
  }
  handlerRegistry.set(type, handler);
}
