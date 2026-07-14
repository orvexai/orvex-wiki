import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { InjectKysely } from 'nestjs-kysely';
import { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User } from '@docmost/db/types/entity.types';
import { UserThrottlerGuard } from '../../integrations/throttle/user-throttler.guard';
import {
  USER_EXPORT_THROTTLER,
  SKIP_NON_EXPORT_THROTTLERS,
} from '../../orvex/orvex-throttler-names';

/**
 * ENG-1473 — User data export (GDPR).
 *
 * PORT of `apps/server/src/orvex/user-export/**` @ orvexai/docmost HEAD
 * `050187676624f2395c55b36ec60e365f87fd4a9f`, retain-and-test (ruling 10),
 * with the D-S11 Linear scrub: the fork's `linearIntegration` branch (which
 * read the now-deleted `linear_integrations` table) is REMOVED — the export
 * body is `{aiChats, aiChatMessages, apiKeys}` only.
 *
 * PLACEMENT NOTE (deviates from the ticket's literal file path): the ticket
 * names `apps/server/src/orvex/user-export/**`, but this repo's binding
 * A-BOUNDARY fence (`eslint.config.mjs`, `no-restricted-imports`) forbids
 * `apps/server/src/orvex/**` from statically importing `@docmost/*` — and
 * this handler must query the existing `aiChats`/`aiChatMessages`/`apiKeys`
 * tables directly. The ticket's own header also classifies this as an
 * "engine host module" in the AGPL `orvexwiki` space, not additive
 * proprietary-bound code. It therefore lives in `core/user-export/`
 * (alongside `core/user`, `core/auth`, …) like every other always-on AGPL
 * feature — un-gated by `ORVEX_MODULES_ENABLED` (a GDPR export must not be a
 * togglable feature flag) — and is wired into `CoreModule`, not
 * `OrvexRootModule`.
 *
 * AC2/AC3 fix (fixer correction, shard-7): at fork HEAD the ONLY
 * `workspaceId` filter lived on the deleted `linearIntegration` branch, so a
 * scrub-then-port would leave the retained `aiChats`/`apiKeys`/
 * `aiChatMessages` selects `creatorId`-only and leak a user's own rows
 * across workspaces. `workspaceId = user.workspaceId` scoping is therefore
 * ADDED to every retained select here (`ai_chats` / `ai_chat_messages` /
 * `api_keys` each carry a notNull `workspace_id` — see migrations
 * `20260409T132415-ai-chat.ts`, `20250912T101500-api-keys.ts`).
 */
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserExportController {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  @SkipThrottle(SKIP_NON_EXPORT_THROTTLERS)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ [USER_EXPORT_THROTTLER]: { limit: 5, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('me/export')
  async exportUserData(
    @AuthUser() user: User,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    // M-17: Content-Disposition: attachment so browsers download the file
    // instead of rendering it inline (prevents CSRF exfiltration via inline
    // display of the returned JSON).
    reply.header('Content-Disposition', 'attachment; filename="export.json"');
    reply.header('Content-Type', 'application/json');

    const [aiChats, apiKeys] = await Promise.all([
      this.db
        .selectFrom('aiChats')
        .select(['id', 'title', 'createdAt', 'updatedAt'])
        .where('creatorId', '=', user.id)
        .where('workspaceId', '=', user.workspaceId)
        .where('deletedAt', 'is', null)
        .execute(),
      this.db
        .selectFrom('apiKeys')
        .select(['id', 'name', 'createdAt', 'lastUsedAt', 'expiresAt'])
        .where('creatorId', '=', user.id)
        .where('workspaceId', '=', user.workspaceId)
        .where('deletedAt', 'is', null)
        .execute(),
    ]);

    const chatIds = aiChats.map((c) => c.id);
    const aiChatMessages =
      chatIds.length > 0
        ? await this.db
            .selectFrom('aiChatMessages')
            .select(['id', 'chatId', 'role', 'content', 'createdAt'])
            .where('chatId', 'in', chatIds)
            .where('workspaceId', '=', user.workspaceId)
            .where('deletedAt', 'is', null)
            .execute()
        : [];

    return { aiChats, aiChatMessages, apiKeys };
  }
}
