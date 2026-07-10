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
 * `AttachmentService` and `ModuleRef` are its collaborators, exercised only
 * to observe whether the (removed) EE-resolution path is invoked — a spy on
 * `moduleRef.get` observably proves the branch is gone, not a call-count on
 * the SUT's own logic.
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
    const moduleRef = { get: jest.fn() };
    const processor = new AttachmentProcessor(
      attachmentService as any,
      moduleRef as any,
    );
    return { processor, attachmentService, moduleRef };
  }

  it('an attachment-index-content job does not resolve the attachments-EE extractor', async () => {
    const { processor, moduleRef } = build();
    await processor.process({
      name: 'attachment-index-content',
      data: { attachmentId: 'a1' },
    } as any);
    expect(moduleRef.get).not.toHaveBeenCalled();
  });

  it('an attachment-indexing job does not resolve the attachments-EE extractor', async () => {
    const { processor, moduleRef } = build();
    await processor.process({
      name: 'attachment-indexing',
      data: { workspaceId: 'w1' },
    } as any);
    expect(moduleRef.get).not.toHaveBeenCalled();
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
