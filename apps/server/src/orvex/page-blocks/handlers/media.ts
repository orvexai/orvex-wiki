import { registerBlockSchema } from '../schemas.controller';

/**
 * Schema-only port of orvexai/docmost @ 050187676624f2395c55b36ec60e365f87fd4a9f
 * apps/server/src/orvex/page-blocks/handlers/media.ts (ENG-1412).
 * See handlers/structure.ts for the scope note (schema catalog only; the
 * DI-registered write handlers — video/audio/pdf/attachment/image_from_prompt
 * via MediaBlockHandlers — are the orvex-wiki-api leg).
 */

registerBlockSchema('video', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'VideoBlock',
  description: 'Video block. Requires a video attachment uploaded via the Docmost attachment API.',
  type: 'object',
  required: ['op', 'attachmentId'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    attachmentId: {
      type: 'string',
      format: 'uuid',
      description: 'UUID of the video attachment (MIME type video/*) already uploaded.',
    },
    title: {
      type: 'string',
      description: 'Optional display label for the video.',
    },
  },
});

registerBlockSchema('audio', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'AudioBlock',
  description: 'Audio block. Requires an audio attachment uploaded via the Docmost attachment API.',
  type: 'object',
  required: ['op', 'attachmentId'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    attachmentId: {
      type: 'string',
      format: 'uuid',
      description: 'UUID of the audio attachment (MIME type audio/*) already uploaded.',
    },
    title: {
      type: 'string',
      description: 'Optional display label for the audio.',
    },
  },
});

registerBlockSchema('pdf', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'PdfBlock',
  description: 'PDF viewer block. Requires a PDF attachment uploaded via the Docmost attachment API.',
  type: 'object',
  required: ['op', 'attachmentId'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    attachmentId: {
      type: 'string',
      format: 'uuid',
      description: 'UUID of the PDF attachment (application/pdf) already uploaded.',
    },
    page: {
      type: 'integer',
      minimum: 1,
      default: 1,
      description: 'Initial page number to display in the PDF viewer.',
    },
    title: {
      type: 'string',
      description: 'Optional display label for the PDF.',
    },
  },
});

registerBlockSchema('attachment', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'AttachmentBlock',
  description: 'Generic file attachment block. Any MIME type is accepted.',
  type: 'object',
  required: ['op', 'attachmentId'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    attachmentId: {
      type: 'string',
      format: 'uuid',
      description: 'UUID of the attachment already uploaded.',
    },
    name: {
      type: 'string',
      description: 'Optional display filename. Falls back to the stored filename when omitted.',
    },
    mime: {
      type: 'string',
      description: 'Optional MIME type hint. Falls back to the stored MIME type when omitted.',
    },
  },
});

registerBlockSchema('image_from_prompt', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'ImageFromPromptBlock',
  description: 'AI-generated image block. The server calls LiteLLM /images/generations.',
  type: 'object',
  required: ['op', 'prompt'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    prompt: {
      type: 'string',
      description: 'Text description of the image to generate.',
    },
    size: {
      type: 'string',
      pattern: '^\\d+x\\d+$',
      default: '1024x1024',
      description: 'Image dimensions in WxH format, e.g. "1024x1024".',
    },
    model: {
      type: 'string',
      default: 'dall-e-3',
      description: 'Image model name as configured in LiteLLM.',
    },
    timeoutSecs: {
      type: 'integer',
      minimum: 1,
      default: 60,
      description: 'Maximum seconds to wait for image generation. Server enforces a 300s cap.',
    },
  },
});
