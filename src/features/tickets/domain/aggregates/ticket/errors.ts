import { CreateDomainError } from '@/infra/ddd/error.js';

export class TicketNotFoundError extends CreateDomainError('ticket_not_found', 404) {}

export class TicketNotOpenError extends CreateDomainError('ticket_not_open', 400) {}

export class TicketNotInProgressError extends CreateDomainError('ticket_not_in_progress', 400) {}

export class TicketNotDoneError extends CreateDomainError('ticket_not_done', 400) {}

export class TicketTransferNotAllowedError extends CreateDomainError(
  'ticket_transfer_not_allowed',
  400,
) {}
