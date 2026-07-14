export enum JwtType {
  ACCESS = 'access',
  COLLAB = 'collab',
  EXCHANGE = 'exchange',
  ATTACHMENT = 'attachment',
  MFA_TOKEN = 'mfa_token',
  API_KEY = 'api_key',
  PDF_RENDER = 'pdf_render',
  PDF_EXPORT_DOWNLOAD = 'pdf_export_download',
}
export type JwtPayload = {
  sub: string;
  email: string;
  workspaceId: string;
  type: 'access';
  sessionId?: string;
  /**
   * Identity-verified token-scope marker (ENG-1380 / B.4). Read-only input
   * here: this leg never mints or catalogs scope values, it only consumes
   * the claim as authored by the (future) identity-owned session mint.
   * Absent = full-privilege (today's default, unchanged behaviour).
   */
  scope?: 'restricted';
};

export type JwtCollabPayload = {
  sub: string;
  workspaceId: string;
  type: 'collab';
};

export type JwtExchangePayload = {
  sub: string;
  workspaceId: string;
  type: 'exchange';
};

export type JwtAttachmentPayload = {
  attachmentId: string;
  pageId: string;
  workspaceId: string;
  type: 'attachment';
};

export interface JwtMfaTokenPayload {
  sub: string;
  workspaceId: string;
  type: 'mfa_token';
}

export type JwtApiKeyPayload = {
  sub: string;
  workspaceId: string;
  apiKeyId: string;
  type: 'api_key';
  /** See {@link JwtPayload.scope}. */
  scope?: 'restricted';
};

export type JwtPdfRenderPayload = {
  pageId: string;
  workspaceId: string;
  type: 'pdf_render';
};

export type JwtPdfExportDownloadPayload = {
  fileTaskId: string;
  workspaceId: string;
  type: 'pdf_export_download';
};
