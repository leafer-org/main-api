import { CreateDomainError } from '@/infra/ddd/error.js';

export class LoginBlockedError extends CreateDomainError('login_blocked', 403).withData<{
  blockedUntil: string;
}>() {}

export class InvalidOtpError extends CreateDomainError('invalid_otp', 400) {}

export class OtpExpiredError extends CreateDomainError('otp_expired', 400) {}

export class OtpThrottleError extends CreateDomainError('throttled', 429).withData<{
  retryAfterSec: number;
}>() {}

export class RegistrationSessionMismatchError extends CreateDomainError(
  'registration_session_mismatch',
  400,
) {}

export class RegistractionError extends CreateDomainError('registration_error', 400) {}
