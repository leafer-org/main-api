import { Inject, Injectable } from '@nestjs/common';

import { ItemEntity } from '../../../domain/aggregates/item/entity.js';
import {
  ItemNotFoundError,
  VideoNotReadyForModerationError,
} from '../../../domain/aggregates/item/errors.js';
import { OrganizationPermissionCheckService } from '../../organization-permission.js';
import { ItemEventPublisher, ItemRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { MediaService } from '@/kernel/application/ports/media.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ItemId, OrganizationId, UserId } from '@/kernel/domain/ids.js';
import type { VideoMedia } from '@/kernel/domain/vo/media-item.js';

@Injectable()
export class SubmitItemForModerationInteractor {
  public constructor(
    @Inject(ItemRepository) private readonly itemRepository: ItemRepository,
    @Inject(ItemEventPublisher) private readonly eventPublisher: ItemEventPublisher,
    @Inject(OrganizationPermissionCheckService)
    private readonly permissionCheck: OrganizationPermissionCheckService,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(MediaService) private readonly mediaService: MediaService,
  ) {}

  public async execute(command: {
    organizationId: OrganizationId;
    userId: UserId;
    itemId: ItemId;
  }) {
    const auth = await this.permissionCheck.mustHavePermission(
      command.organizationId,
      command.userId,
      'publish_items',
    );
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const item = await this.itemRepository.findById(tx, command.itemId);
      if (!item) return Left(new ItemNotFoundError());

      const videoCheck = await this.checkVideosReady(item);
      if (isLeft(videoCheck)) return videoCheck;

      const result = ItemEntity.submitForModeration(item, {
        type: 'SubmitItemForModeration',
        now,
      });
      if (isLeft(result)) return result;

      const { state: newState, event } = result.value;
      await this.itemRepository.save(tx, newState);
      await this.eventPublisher.publishModerationRequested(tx, {
        id: crypto.randomUUID(),
        type: 'item.moderation-requested',
        itemId: event.itemId,
        organizationId: event.organizationId,
        typeId: event.typeId,
        widgets: event.widgets,
        submittedAt: event.submittedAt,
      });

      return Right(undefined);
    });
  }

  private async checkVideosReady(item: ItemEntity) {
    if (!item.draft) return Right(undefined);

    const baseInfoWidget = item.draft.widgets.find((w) => w.type === 'base-info');
    if (!baseInfoWidget || baseInfoWidget.type !== 'base-info') return Right(undefined);

    const videos = baseInfoWidget.media.filter((m): m is VideoMedia => m.type === 'video');
    if (videos.length === 0) return Right(undefined);

    const statuses = await Promise.all(
      videos.map((v) => this.mediaService.getVideoStatus(v.mediaId)),
    );

    const allReady = statuses.every((s) => s === 'ready');
    if (!allReady) return Left(new VideoNotReadyForModerationError());

    return Right(undefined);
  }
}
