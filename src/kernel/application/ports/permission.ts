import { CreateDomainError } from '@/infra/ddd/error.js';
import type { Either } from '@/infra/lib/box.js';
import type { Permission } from '@/kernel/domain/permissions.js';

export class PermissionDeniedError extends CreateDomainError('permission_denied', 403).withData<{
  action: string;
  role: string;
}>() {}

export abstract class PermissionCheckService {
  public abstract can(perm: Permission): Promise<boolean>;

  public abstract mustCan(perm: Permission): Promise<Either<PermissionDeniedError, void>>;
}
