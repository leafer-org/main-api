import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import type { Request } from 'express';

import { GetOrganizationDetailInteractor } from '../../application/use-cases/view-organization/get-organization-detail.interactor.js';
import { avatarImageProxy, cardImageOptions } from './image-proxy-options.js';
import { resolveItemListMedia } from './resolve-item-media.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { MediaService } from '@/kernel/application/ports/media.js';

@Public()
@Controller('orgs')
export class OrganizationDetailController {
  public constructor(
    private readonly getOrganizationDetail: GetOrganizationDetailInteractor,
    @Inject(MediaService) private readonly mediaService: MediaService,
  ) {}

  @Get(':orgId')
  public async getOrgDetail(
    @Req() req: Request,
    @Param('orgId') orgId: string,
  ): Promise<PublicResponse['getDiscoveryOrganizationDetail']> {
    const result = await this.getOrganizationDetail.execute(orgId);

    if (isLeft(result)) {
      throw domainToHttpError(result.error.toResponse());
    }

    const { profile, items: rawItems } = result.value;

    const loader = this.mediaService.createMediaLoader(cardImageOptions(req));
    const avatarProxy = avatarImageProxy(req);

    const [resolvedItems, avatarUrl, resolvedMedia, resolvedTeam] = await Promise.all([
      resolveItemListMedia(rawItems, loader, avatarProxy),
      loader.getImageUrl(profile.avatarId, avatarProxy),
      Promise.all(profile.media.map((m) => loader.resolve(m))),
      profile.team
        ? Promise.all(
            profile.team.members.map(async (m) => ({
              name: m.name,
              description: m.description ?? null,
              employeeUserId: m.employeeUserId ?? null,
              avatarUrl:
                m.media.length > 0 ? await loader.getImageUrl(m.media[0]!.mediaId, avatarProxy) : null,
            })),
          )
        : Promise.resolve(null),
    ]);

    return {
      profile: {
        organizationId: profile.organizationId as string,
        name: profile.name,
        description: profile.description,
        avatarId: profile.avatarId as string | null,
        avatarUrl,
        media: resolvedMedia,
        contacts: profile.contacts.map((c) => ({
          type: c.type,
          value: c.value,
          label: c.label ?? undefined,
        })),
        team:
          profile.team && resolvedTeam
            ? { title: profile.team.title, members: resolvedTeam }
            : null,
        rating: profile.rating,
        reviewCount: profile.reviewCount,
      },
      items: resolvedItems,
    };
  }
}
