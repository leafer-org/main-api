import type { ValueObject } from '@/infra/ddd/value-object.js';

export type AgeGroup = 'children' | 'adults' | 'all';

export type Role = ValueObject<string, 'Role'>;

export const Role = {
  default(): Role {
    return 'USER' as Role;
  },
  raw(role: string): Role {
    return role as Role;
  },
};
