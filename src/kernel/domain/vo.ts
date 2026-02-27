import type { ValueObject } from '@/infra/ddd/value-object.js';

export type Role = ValueObject<'ADMIN' | 'USER', 'Role'>;

export const Role = {
  default(): Role {
    return 'USER' as Role;
  },
};
