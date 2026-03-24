import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { RecordInteractionInteractor } from '../../application/use-cases/record-interaction/record-interaction.interactor.js';
import { RecordViewsInteractor } from '../../application/use-cases/record-views/record-views.interactor.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import type { PublicBody } from '@/infra/contracts/types.js';
import { ItemId } from '@/kernel/domain/ids.js';

@Controller('interactions')
export class InteractionsController {
  public constructor(
    private readonly recordViews: RecordViewsInteractor,
    private readonly recordInteraction: RecordInteractionInteractor,
  ) {}

  @Post('views')
  @HttpCode(204)
  public async views(
    @Body() body: PublicBody['recordViews'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    await this.recordViews.execute({
      userId: user.userId,
      itemIds: body.itemIds.map((id) => ItemId.raw(id)),
    });
  }

  @Post('click')
  @HttpCode(204)
  public async click(
    @Body() body: PublicBody['recordClick'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    await this.recordInteraction.execute({
      userId: user.userId,
      itemId: ItemId.raw(body.itemId),
      type: 'click',
    });
  }

  @Post('show-contacts')
  @HttpCode(204)
  public async showContacts(
    @Body() body: PublicBody['recordShowContacts'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    await this.recordInteraction.execute({
      userId: user.userId,
      itemId: ItemId.raw(body.itemId),
      type: 'show-contacts',
    });
  }

  @Post('contact-click')
  @HttpCode(204)
  public async contactClick(
    @Body() body: PublicBody['recordContactClick'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    await this.recordInteraction.execute({
      userId: user.userId,
      itemId: ItemId.raw(body.itemId),
      type: 'contact-click',
      metadata: {
        ...(body.contactIndex !== undefined && { contactIndex: body.contactIndex }),
        ...(body.contactType !== undefined && { contactType: body.contactType }),
      },
    });
  }
}
