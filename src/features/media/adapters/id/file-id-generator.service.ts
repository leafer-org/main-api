import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { FileIdGenerator } from '../../application/ports.js';
import { FileId } from '@/kernel/domain/ids.js';

@Injectable()
export class UuidFileIdGenerator implements FileIdGenerator {
  public generateFileId(): FileId {
    return FileId.raw(randomUUID());
  }
}
