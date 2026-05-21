import { Injectable } from '@nestjs/common';

import { PostIdGenerator } from '../application/ports.js';
import { PostCommentId, PostId } from '@/kernel/domain/ids.js';

@Injectable()
export class UuidPostIdGenerator extends PostIdGenerator {
  public generatePostId(): PostId {
    return PostId.raw(crypto.randomUUID());
  }

  public generateCommentId(): PostCommentId {
    return PostCommentId.raw(crypto.randomUUID());
  }
}
