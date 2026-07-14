// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { maskValue } from '../attachments/orvex-mask.util';
import {
  assertWorkspaceAdmin,
  OrvexAuthedUser,
  OrvexAuthedWorkspace,
} from '../attachments/orvex-workspace-auth';
import { MailTestDto } from './dto/mail-test.dto';
import {
  ORVEX_SMTP_PROBE_TRANSPORT_FACTORY,
  SmtpProbeTransportFactory,
} from './orvex-smtp-probe-transport.factory';

/**
 * SMTP mail operational-config admin surface (ported from
 * orvex-mail-admin.controller.ts, orvexai/docmost @ 050187676624).
 * Handler-tier only: authn/z -> read/probe -> mask. No domain logic beyond
 * masking (CS §6, ❌1). `password` is NEVER returned, even masked.
 */
@Controller('api/integrations/mail')
export class OrvexMailAdminController {
  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    @Inject(ORVEX_SMTP_PROBE_TRANSPORT_FACTORY)
    private readonly smtpProbeTransportFactory: SmtpProbeTransportFactory,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('settings')
  getSettings(
    @AuthUser() user: OrvexAuthedUser,
    @AuthWorkspace() workspace: OrvexAuthedWorkspace,
  ) {
    assertWorkspaceAdmin(this.workspaceAbility, user, workspace);

    const username = this.environmentService.getSmtpUsername();

    return {
      driver: this.environmentService.getMailDriver(),
      host: this.environmentService.getSmtpHost(),
      port: this.environmentService.getSmtpPort(),
      secure: this.environmentService.getSmtpSecure(),
      from: this.environmentService.getMailFromAddress(),
      hasUsername: !!username,
      usernameMasked: maskValue(username),
    };
  }

  // Validated by the app-wide global ValidationPipe (main.ts): an invalid
  // `recipient` (class-validator `IsEmail`) fails BEFORE this handler runs,
  // with class-validator's per-property `ValidationError` surfaced in the
  // default 400 body (AC7) — no per-route pipe needed/wanted here.
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('test')
  async testMail(
    @Body() dto: MailTestDto,
    @AuthUser() user: OrvexAuthedUser,
    @AuthWorkspace() workspace: OrvexAuthedWorkspace,
  ): Promise<{ ok: boolean }> {
    assertWorkspaceAdmin(this.workspaceAbility, user, workspace);

    const username = this.environmentService.getSmtpUsername();
    const password = this.environmentService.getSmtpPassword();

    const transport = this.smtpProbeTransportFactory.create({
      host: this.environmentService.getSmtpHost(),
      port: this.environmentService.getSmtpPort(),
      secure: this.environmentService.getSmtpSecure(),
      ignoreTLS: this.environmentService.getSmtpIgnoreTLS(),
      auth: username ? { user: username, pass: password } : undefined,
    });

    const from = `${this.environmentService.getMailFromName()} <${this.environmentService.getMailFromAddress()}>`;

    await transport.sendMail({
      from,
      to: dto.recipient,
      subject: 'Orvex Wiki — test email',
      text: 'This is a test email from your Orvex Wiki workspace mail settings.',
    });

    return { ok: true };
  }
}
