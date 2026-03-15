import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { MediaIdGenerator } from '../../application/ports.js';
import { MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class UuidMediaIdGenerator implements MediaIdGenerator {
  public generateMediaId(): MediaId {
    return MediaId.raw(randomUUID());
  }
}
