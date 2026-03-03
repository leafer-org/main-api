import type { WhereArg } from '@/infra/auth/authz/permission-service.js';
import type { InferPermissionValue, PermissionVariant } from '@/infra/auth/authz/schema.js';
import { CreateDomainError } from '@/infra/ddd/error.js';
import type { Either } from '@/infra/lib/box.js';

export class PermissionDeniedError extends CreateDomainError('permission_denied', 403).withData<{
  action: string;
  role: string;
}>() {}

export abstract class PermissionCheckService {
  public abstract can<T extends PermissionVariant>(
    perm: T,
    ...args: WhereArg<InferPermissionValue<T>>
  ): Promise<boolean>;

  public abstract mustCan<T extends PermissionVariant>(
    perm: T,
    ...args: WhereArg<InferPermissionValue<T>>
  ): Promise<Either<PermissionDeniedError, void>>;
}
