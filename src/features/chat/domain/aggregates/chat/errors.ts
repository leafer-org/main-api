import { CreateDomainError } from '@/infra/ddd/error.js';

export class ChatNotFoundError extends CreateDomainError('chat_not_found', 404) {}

export class ChatBlockedError extends CreateDomainError('chat_blocked', 403) {}

export class InvalidParticipantsError extends CreateDomainError('invalid_participants', 400) {}

export class ForbiddenPairError extends CreateDomainError('forbidden_pair', 400) {}

export class OrganizationCannotInitiateError extends CreateDomainError(
  'organization_cannot_initiate',
  403,
) {}

export class EmptyMessageError extends CreateDomainError('empty_message', 400) {}

export class MessageTextTooLongError extends CreateDomainError('message_text_too_long', 400) {}

export class MessageTooManyMediaError extends CreateDomainError('message_too_many_media', 400) {}

export class SenderNotInChatError extends CreateDomainError('sender_not_in_chat', 400) {}

export class ClaimRequiredError extends CreateDomainError('claim_required', 400) {}

export class SlotNotFoundError extends CreateDomainError('slot_not_found', 404) {}

export class SlotNotClaimableError extends CreateDomainError('slot_not_claimable', 400) {}

export class SlotAlreadyClaimedError extends CreateDomainError('slot_already_claimed', 409) {}

export class SlotNotClaimedError extends CreateDomainError('slot_not_claimed', 400) {}

export class ChatNotOpenError extends CreateDomainError('chat_not_open', 409) {}

export class ChatNotBlockedError extends CreateDomainError('chat_not_blocked', 409) {}

export class CannotActAsUserError extends CreateDomainError('cannot_act_as_user', 403) {}

export class ParticipantNotFoundError extends CreateDomainError('participant_not_found', 404) {}
