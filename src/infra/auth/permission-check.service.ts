import { Injectable } from '@nestjs/common';

import { PermissionService, type WhereArg } from '@/infra/lib/authorization/permission-service.js';
import type { InferPermissionValue, PermissionVariant } from '@/infra/lib/authorization/schema.js';
import { SessionContext } from '@/infra/lib/authorization/session-context.js';
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

  public can<T extends PermissionVariant>(
    perm: T,
    ...args: WhereArg<InferPermissionValue<T>>
  ): boolean {
    return this.inner.can(perm, ...args);
  }

  public mustCan<T extends PermissionVariant>(
    perm: T,
    ...args: WhereArg<InferPermissionValue<T>>
  ): Either<PermissionDeniedError, void> {
    if (!this.inner.can(perm, ...args)) {
      const role = this.sessionContext.getRole();
      return Left(new PermissionDeniedError({ action: perm.action, role }));
    }
    return Right(undefined);
  }
}
