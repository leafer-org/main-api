import { BooleanPerm, EnumPerm } from '@/infra/auth/authz/schema.js';

export const Permissions = {
  manageSession: EnumPerm('SESSION.MANAGE', ['self', 'all'] as const, 'self'),
  manageRole: BooleanPerm('ROLE.MANAGE', false),
  manageUser: BooleanPerm('USER.MANAGE', false),
  manageCms: BooleanPerm('CMS.MANAGE', false),
  moderateReview: BooleanPerm('REVIEW.MODERATE', false),
  moderateOrganization: BooleanPerm('ORGANIZATION.MODERATE', false),
  manageTicketBoard: BooleanPerm('TICKET_BOARD.MANAGE', false),
  manageTicket: BooleanPerm('TICKET.MANAGE', false),
  reassignTicket: BooleanPerm('TICKET.REASSIGN', false),
} as const;
