import { Injectable } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';

export const ORVEX_S3_PROBE_CLIENT_FACTORY = 'ORVEX_S3_PROBE_CLIENT_FACTORY';

export interface S3ProbeClientConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

export interface S3ProbeClient {
  send(command: unknown, options?: { abortSignal?: AbortSignal }): Promise<unknown>;
  destroy(): void;
}

export interface S3ProbeClientFactory {
  create(config: S3ProbeClientConfig): S3ProbeClient;
}

/**
 * Per-request S3 probe client (CS §4f / ❌8): constructed at the handler
 * boundary from admin-supplied params for a single HeadBucket probe, NEVER
 * persisted and NEVER injected as a shared/global client. This is the only
 * production implementation; tests substitute a fake factory whose `send`
 * replays a real HeadBucket success/error response (S3 is true-external).
 */
@Injectable()
export class RealS3ProbeClientFactory implements S3ProbeClientFactory {
  create(config: S3ProbeClientConfig): S3ProbeClient {
    return new S3Client({
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
    }) as unknown as S3ProbeClient;
  }
}
