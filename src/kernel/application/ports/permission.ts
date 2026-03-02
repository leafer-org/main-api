import { CreateDomainError } from '@/infra/ddd/error.js';
import type { WhereArg } from '@/infra/auth/permission-service.js';
import type { InferPermissionValue, PermissionVariant } from '@/infra/auth/schema.js';
import type { Either } from '@/infra/lib/box.js';

export class PermissionDeniedError extends CreateDomainError('permission_denied', 403).withData<{
  action: string;
  role: string;
}>() {}

export abstract class PermissionCheckService {
  public abstract can<T extends PermissionVariant>(
    perm: T,
    ...args: WhereArg<InferPermissionValue<T>>
  ): boolean;

  public abstract mustCan<T extends PermissionVariant>(
    perm: T,
    ...args: WhereArg<InferPermissionValue<T>>
  ): Either<PermissionDeniedError, void>;
}
