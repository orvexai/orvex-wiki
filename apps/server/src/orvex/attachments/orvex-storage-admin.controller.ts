import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { maskKey } from './orvex-mask.util';
import { StorageTestDto } from './dto/storage-test.dto';
import {
  ORVEX_S3_PROBE_CLIENT_FACTORY,
  S3ProbeClientFactory,
} from './orvex-s3-probe-client.factory';
import {
  assertWorkspaceAdmin,
  OrvexAuthedUser,
  OrvexAuthedWorkspace,
} from './orvex-workspace-auth';

/** Bounded probe timeout (AC10 — never hang, never 500 on an unreachable host). */
const STORAGE_PROBE_TIMEOUT_MS = 5000;

/**
 * S3 storage operational-config admin surface (ported from
 * orvex-storage-admin.controller.ts, orvexai/docmost @ 050187676624).
 * Handler-tier only: authn/z -> read/probe -> mask. No domain logic beyond
 * masking (CS §6, ❌1).
 */
@Controller('api/integrations/storage')
export class OrvexStorageAdminController {
  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    @Inject(ORVEX_S3_PROBE_CLIENT_FACTORY)
    private readonly s3ProbeClientFactory: S3ProbeClientFactory,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('settings')
  getSettings(
    @AuthUser() user: OrvexAuthedUser,
    @AuthWorkspace() workspace: OrvexAuthedWorkspace,
  ) {
    assertWorkspaceAdmin(this.workspaceAbility, user, workspace);

    return {
      driver: this.environmentService.getStorageDriver(),
      endpoint: this.environmentService.getAwsS3Endpoint(),
      bucket: this.environmentService.getAwsS3Bucket(),
      region: this.environmentService.getAwsS3Region(),
      forcePathStyle: this.environmentService.getAwsS3ForcePathStyle(),
      accessKeyId: maskKey(this.environmentService.getAwsS3AccessKeyId()),
      secretAccessKey: maskKey(
        this.environmentService.getAwsS3SecretAccessKey(),
      ),
    };
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('test')
  async testStorage(
    @Body() dto: StorageTestDto,
    @AuthUser() user: OrvexAuthedUser,
    @AuthWorkspace() workspace: OrvexAuthedWorkspace,
  ): Promise<{ ok: boolean; error?: string }> {
    assertWorkspaceAdmin(this.workspaceAbility, user, workspace);

    const client = this.s3ProbeClientFactory.create({
      accessKeyId: dto.accessKeyId,
      secretAccessKey: dto.secretAccessKey,
      region: dto.region,
      endpoint: dto.endpoint,
      forcePathStyle: dto.forcePathStyle,
    });

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      STORAGE_PROBE_TIMEOUT_MS,
    );

    try {
      await client.send(new HeadBucketCommand({ Bucket: dto.bucket }), {
        abortSignal: controller.signal,
      });
      return { ok: true };
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : undefined;
      const message = err instanceof Error ? err.message : undefined;
      const isTimeout = controller.signal.aborted || name === 'AbortError';
      return {
        ok: false,
        error: isTimeout ? 'timeout' : (name ?? message ?? 'unreachable'),
      };
    } finally {
      clearTimeout(timeout);
      client.destroy();
    }
  }
}
