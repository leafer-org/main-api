import { Injectable } from '@nestjs/common';

import { TicketIdGenerator } from '../application/ports.js';
import { BoardAutomationId, BoardId, BoardSubscriptionId, TicketId } from '@/kernel/domain/ids.js';

@Injectable()
export class UuidTicketIdGenerator extends TicketIdGenerator {
  public generateTicketId(): TicketId {
    return TicketId.raw(crypto.randomUUID());
  }

  public generateBoardId(): BoardId {
    return BoardId.raw(crypto.randomUUID());
  }

  public generateBoardSubscriptionId(): BoardSubscriptionId {
    return BoardSubscriptionId.raw(crypto.randomUUID());
  }

  public generateBoardAutomationId(): BoardAutomationId {
    return BoardAutomationId.raw(crypto.randomUUID());
  }
}
