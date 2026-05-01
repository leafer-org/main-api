import { Inject, Injectable } from '@nestjs/common';

import { SessionContext } from '../session/session-context.js';
import { PermissionService } from './permission-service.js';
import type { Either } from '@/infra/lib/box.js';
import { Left, Right } from '@/infra/lib/box.js';
import {
  PermissionCheckService,
  PermissionDeniedError,
} from '@/kernel/application/ports/permission.js';
import type { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class PermissionCheckServiceImpl extends PermissionCheckService {
  public constructor(
    @Inject(PermissionService) private readonly inner: PermissionService,
    @Inject(SessionContext) private readonly sessionContext: SessionContext,
  ) {
    super();
  }

  public async can(perm: Permission): Promise<boolean> {
    return this.inner.can(perm);
  }

  public async mustCan(perm: Permission): Promise<Either<PermissionDeniedError, void>> {
    if (!(await this.inner.can(perm))) {
      const role = this.sessionContext.getRole();
      return Left(new PermissionDeniedError({ action: perm, role }));
    }
    return Right(undefined);
  }
}
