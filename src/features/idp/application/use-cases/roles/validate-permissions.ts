import { type Either, Left, Right } from '@/infra/lib/box.js';
import { Permissions } from '@/kernel/domain/permissions.js';

import { InvalidPermissionsError } from '../../../domain/aggregates/role/errors.js';

const permissionsByAction = new Map(
  Object.values(Permissions).map((p) => [p.action, p]),
);

export function validatePermissions(
  input: Record<string, unknown>,
): Either<InvalidPermissionsError, Record<string, unknown>> {
  const errors: string[] = [];

  for (const [action, value] of Object.entries(input)) {
    const perm = permissionsByAction.get(action);

    if (!perm) {
      errors.push(`Unknown permission action: ${action}`);
      continue;
    }

    if (perm.context.type === 'boolean') {
      if (typeof value !== 'boolean') {
        errors.push(`Permission ${action} must be a boolean, got ${typeof value}`);
      }
    } else if (perm.context.type === 'enum') {
      if (!perm.context.values.includes(value as string)) {
        errors.push(
          `Permission ${action} must be one of [${perm.context.values.join(', ')}], got ${String(value)}`,
        );
      }
    }
  }

  if (errors.length > 0) {
    return Left(new InvalidPermissionsError({ errors }));
  }

  return Right(input);
}
