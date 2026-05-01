import { type Either, Left, Right } from '@/infra/lib/box.js';
import { ALL_PERMISSIONS, type Permission } from '@/kernel/domain/permissions.js';

import { InvalidPermissionsError } from '../../../domain/aggregates/role/errors.js';

const KNOWN_PERMISSIONS = new Set<string>(ALL_PERMISSIONS);

export function validatePermissions(
  input: unknown,
): Either<InvalidPermissionsError, Permission[]> {
  if (!Array.isArray(input)) {
    return Left(new InvalidPermissionsError({ errors: ['Permissions must be an array'] }));
  }

  const errors: string[] = [];
  const seen = new Set<string>();
  const result: Permission[] = [];

  for (const value of input) {
    if (typeof value !== 'string') {
      errors.push(`Permission must be a string, got ${typeof value}`);
      continue;
    }
    if (!KNOWN_PERMISSIONS.has(value)) {
      errors.push(`Unknown permission: ${value}`);
      continue;
    }
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value as Permission);
  }

  if (errors.length > 0) {
    return Left(new InvalidPermissionsError({ errors }));
  }

  return Right(result);
}
