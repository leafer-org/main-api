import { BooleanPerm, EnumPerm } from '@/infra/auth/schema.js';

export const Permissions = {
  manageSession: EnumPerm('SESSION.MANAGE', ['self', 'all'] as const, 'self'),
  manageRole: BooleanPerm('ROLE.MANAGE', false),
  manageUser: BooleanPerm('USER.MANAGE', false),
} as const;
