import { Injectable } from '@nestjs/common';

import { SessionContext } from '../session/session-context.js';
import { PermissionService, type WhereArg } from './permission-service.js';
import type { InferPermissionValue, PermissionVariant } from './schema.js';
import type { Either } from '@/infra/lib/box.js';
import { Left, Right } from '@/infra/lib/box.js';
import {
  PermissionCheckService,
  PermissionDeniedError,
} from '@/kernel/application/ports/permission.js';

@Injectable()
export class PermissionCheckServiceImpl extends PermissionCheckService {
  public constructor(
    private readonly inner: PermissionService,
    private readonly sessionContext: SessionContext,
  ) {
    super();
  }

  public async can<T extends PermissionVariant>(
    perm: T,
    ...args: WhereArg<InferPermissionValue<T>>
  ): Promise<boolean> {
    return this.inner.can(perm, ...args);
  }

  public async mustCan<T extends PermissionVariant>(
    perm: T,
    ...args: WhereArg<InferPermissionValue<T>>
  ): Promise<Either<PermissionDeniedError, void>> {
    if (!(await this.inner.can(perm, ...args))) {
      const role = this.sessionContext.getRole();
      return Left(new PermissionDeniedError({ action: perm.action, role }));
    }
    return Right(undefined);
  }
}
