// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-1437 T3/AC4 — `AttachmentProcessor.process` no longer routes the
 * FTS-index job (`attachment-index-content` / `attachment-indexing`): the
 * branch that lazy-`require()`d the non-bundled attachments-EE extractor
 * is gone. The DELETE_* branches must still route unaffected.
 *
 * `AttachmentProcessor` is the SUT (real class, not mocked — CS §5 ❌#4).
 * `AttachmentService` is its sole remaining collaborator (the `ModuleRef`
 * collaborator that used to lazily resolve the removed EE extractor is
 * gone too — review-1 F3).
 *
 * Review-1 F2: this spec used to also assert `moduleRef.get` was never
 * called for the FTS job names, as a behavioral proxy for "the branch is
 * gone". That assertion was tautological — proven by overlaying the OLD
 * processor source (FTS branch present): it still passed, because the old
 * branch's `require('.../attachments-ee/attachment-ee.service')` throws
 * (the module isn't bundled in this build) BEFORE `moduleRef.get` is ever
 * reached, so the spy never observes the branch either way. Now that
 * `ModuleRef` isn't even injected, that assertion is not just misleading
 * but inexpressible. AC4's real (non-tautological) gate is the static grep
 * in `eng1437-fts-decommission-static-gate.spec.ts` (asserts no
 * `require(...attachments-ee/attachment-ee.service...)` string in the
 * processor source) — kept as the sole AC4 gate. This spec is scoped to
 * what it CAN prove honestly: the FTS job names are no-ops (no
 * `attachmentService` call, no throw) and the DELETE_* routing survives.
 */
import { AttachmentProcessor } from './attachment.processor';

describe('AttachmentProcessor.process — AC4', () => {
  function build() {
    const attachmentService = {
      handleDeleteSpaceAttachments: jest.fn().mockResolvedValue(undefined),
      handleDeleteUserAvatars: jest.fn().mockResolvedValue(undefined),
      handleDeletePageAttachments: jest.fn().mockResolvedValue(undefined),
      handleDeleteAiChatAttachments: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new AttachmentProcessor(attachmentService as any);
    return { processor, attachmentService };
  }

  it('an attachment-index-content job is a no-op (no attachmentService call, no throw)', async () => {
    const { processor, attachmentService } = build();
    await expect(
      processor.process({
        name: 'attachment-index-content',
        data: { attachmentId: 'a1' },
      } as any),
    ).resolves.toBeUndefined();
    expect(attachmentService.handleDeleteSpaceAttachments).not.toHaveBeenCalled();
    expect(attachmentService.handleDeleteUserAvatars).not.toHaveBeenCalled();
    expect(attachmentService.handleDeletePageAttachments).not.toHaveBeenCalled();
    expect(attachmentService.handleDeleteAiChatAttachments).not.toHaveBeenCalled();
  });

  it('an attachment-indexing job is a no-op (no attachmentService call, no throw)', async () => {
    const { processor, attachmentService } = build();
    await expect(
      processor.process({
        name: 'attachment-indexing',
        data: { workspaceId: 'w1' },
      } as any),
    ).resolves.toBeUndefined();
    expect(attachmentService.handleDeleteSpaceAttachments).not.toHaveBeenCalled();
    expect(attachmentService.handleDeleteUserAvatars).not.toHaveBeenCalled();
    expect(attachmentService.handleDeletePageAttachments).not.toHaveBeenCalled();
    expect(attachmentService.handleDeleteAiChatAttachments).not.toHaveBeenCalled();
  });

  it('a delete-space-attachments job still routes', async () => {
    const { processor, attachmentService } = build();
    await processor.process({
      name: 'delete-space-attachments',
      data: { id: 's1' },
    } as any);
    expect(attachmentService.handleDeleteSpaceAttachments).toHaveBeenCalledWith(
      's1',
    );
  });

  it('a delete-page-attachments job still routes', async () => {
    const { processor, attachmentService } = build();
    await processor.process({
      name: 'delete-page-attachments',
      data: { pageId: 'p1' },
    } as any);
    expect(attachmentService.handleDeletePageAttachments).toHaveBeenCalledWith(
      'p1',
    );
  });
});
