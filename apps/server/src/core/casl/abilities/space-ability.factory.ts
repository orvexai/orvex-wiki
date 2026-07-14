import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
} from '@casl/ability';
import { SpaceRole } from '../../../common/helpers/types/permission';
import { User } from '@docmost/db/types/entity.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import {
  SpaceCaslAction,
  ISpaceAbility,
  SpaceCaslSubject,
} from '../interfaces/space-ability.type';
import { findHighestUserSpaceRole } from '@docmost/db/repos/space/utils';
import { intersectWithTokenScope } from '../scope-intersection';

@Injectable()
export default class SpaceAbilityFactory {
  constructor(private readonly spaceMemberRepo: SpaceMemberRepo) {}
  async createForUser(user: User, spaceId: string) {
    const userSpaceRoles = await this.spaceMemberRepo.getUserSpaceRoles(
      user.id,
      spaceId,
    );

    const userSpaceRole = findHighestUserSpaceRole(userSpaceRoles);

    let creatorAbility;
    switch (userSpaceRole) {
      case SpaceRole.ADMIN:
        creatorAbility = buildSpaceAdminAbility();
        break;
      case SpaceRole.WRITER:
        creatorAbility = buildSpaceWriterAbility();
        break;
      case SpaceRole.READER:
        creatorAbility = buildSpaceReaderAbility();
        break;
      default:
        throw new NotFoundException('Space permissions not found');
    }

    // ENG-1454 (C3/C4 wiring) — the single choke point every space-scoped
    // controller resolves its ability through. Floors `creatorAbility` to
    // whatever token-scope grant (if any) was stamped onto `user` at the
    // auth seam (`JwtStrategy.validateApiKey`) — never wider.
    return intersectWithTokenScope(creatorAbility, spaceId, user);
  }
}

function buildSpaceAdminAbility() {
  const { can, build } = new AbilityBuilder<MongoAbility<ISpaceAbility>>(
    createMongoAbility,
  );
  can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings);
  can(SpaceCaslAction.Manage, SpaceCaslSubject.Member);
  can(SpaceCaslAction.Manage, SpaceCaslSubject.Page);
  can(SpaceCaslAction.Manage, SpaceCaslSubject.Share);
  return build();
}

function buildSpaceWriterAbility() {
  const { can, build } = new AbilityBuilder<MongoAbility<ISpaceAbility>>(
    createMongoAbility,
  );
  can(SpaceCaslAction.Read, SpaceCaslSubject.Settings);
  can(SpaceCaslAction.Read, SpaceCaslSubject.Member);
  can(SpaceCaslAction.Manage, SpaceCaslSubject.Page);
  can(SpaceCaslAction.Manage, SpaceCaslSubject.Share);
  return build();
}

function buildSpaceReaderAbility() {
  const { can, build } = new AbilityBuilder<MongoAbility<ISpaceAbility>>(
    createMongoAbility,
  );
  can(SpaceCaslAction.Read, SpaceCaslSubject.Settings);
  can(SpaceCaslAction.Read, SpaceCaslSubject.Member);
  can(SpaceCaslAction.Read, SpaceCaslSubject.Page);
  can(SpaceCaslAction.Read, SpaceCaslSubject.Share);
  return build();
}
