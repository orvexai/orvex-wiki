import {
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { VersionService } from './version.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EnvironmentService } from '../environment/environment.service';

/**
 * NOT an AGPL §13 mechanism (ENG-2500 AC4). This authenticated,
 * upstream-org-pointing "check for updates" endpoint was never a valid
 * source offer (it is JwtAuthGuard-gated — not reachable by "any network
 * user" — and points at the upstream project's releases, not this fork's
 * corresponding source). The ONE canonical §13 surface is the
 * unauthenticated `GET /api/orvex/source` (`OrvexSourceController`),
 * which returns the exact built commit ({sha, sourceRepo}) from
 * ORVEX_GIT_SHA/ORVEX_SOURCE_REPO. This controller stays authenticated and
 * serves ONLY the unrelated upstream-update-check feature.
 */
@UseGuards(JwtAuthGuard)
@Controller('version')
export class VersionController {
  constructor(
    private readonly versionService: VersionService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async getVersion() {
    if (this.environmentService.isCloud()) throw new NotFoundException();
    return this.versionService.getVersion();
  }
}
