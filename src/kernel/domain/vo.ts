import { CreateDomainError } from '@/infra/ddd/error.js';
import type { ValueObject } from '@/infra/ddd/value-object.js';

export type Role = ValueObject<'ADMIN' | 'USER', 'Role'>;

export class InvalidRoleError extends CreateDomainError('invalid_role_error') {}

export const Role = {
  default(): Role {
    return 'USER' as Role;
  },

  createUnsafe(role: string): Role {
    if (role !== 'ADMIN' && role !== 'USER') {
      throw new Error('Role invalid');
    }
    return role as Role;
  },
  raw(role: string): Role {
    return role as Role;
  },
};
