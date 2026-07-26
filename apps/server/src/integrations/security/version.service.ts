import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require('./../../../package.json');

/**
 * Upstream-update check ONLY — NOT an AGPL §13 mechanism (ENG-2500 AC4).
 * The upstream-org URLs below (docmost/docmost) advertise the UPSTREAM
 * project's release feed for the self-hosted "new version available"
 * indicator; they are NOT this fork's corresponding-source offer. §13 is
 * answered exclusively by `GET /api/orvex/source` ({sha, sourceRepo} from
 * ORVEX_GIT_SHA/ORVEX_SOURCE_REPO) — see LICENSE-COMPLIANCE.md at the repo
 * root. Keeping this feature (rather than deleting it) is deliberate: it
 * still serves the legitimate "check for upstream updates" purpose,
 * reconciled here to carry no compliance role.
 */
@Injectable()
export class VersionService {
  constructor() {}

  async getVersion() {
    const url = `https://api.github.com/repos/docmost/docmost/releases/latest`;

    let latestVersion = 0;
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const data = await response.json();
      latestVersion = data?.tag_name?.replace('v', '');
    } catch (err) {
      /* empty */
    }

    return {
      currentVersion: packageJson?.version,
      latestVersion: latestVersion,
      releaseUrl: 'https://github.com/docmost/docmost/releases',
    };
  }
}
