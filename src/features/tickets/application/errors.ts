import { CreateDomainError } from '@/infra/ddd/error.js';

export class NotABoardMemberError extends CreateDomainError('not_a_board_member', 403) {}

export class ManualCreationNotAllowedError extends CreateDomainError(
  'manual_creation_not_allowed',
  400,
) {}
