import { BooleanPerm, EnumPerm } from '@/infra/auth/authz/schema.js';

export const Permissions = {
  manageSession: EnumPerm('SESSION.MANAGE', ['self', 'all'] as const, 'self'),
  manageRole: BooleanPerm('ROLE.MANAGE', false),
  manageUser: BooleanPerm('USER.MANAGE', false),
  manageCms: BooleanPerm('CMS.MANAGE', false),
} as const;
