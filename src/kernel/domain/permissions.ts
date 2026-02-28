import { BooleanPerm, EnumPerm } from '@/infra/lib/authorization/schema.js';

export const Permissions = {
  manageSession: EnumPerm('SESSION.MANAGE', ['self', 'all'] as const, 'self'),
  manageRole: BooleanPerm('ROLE.MANAGE', false),
} as const;
