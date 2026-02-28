import { CreateDomainError } from '@/infra/ddd/error.js';

export class LoginBlockedError extends CreateDomainError('login_blocked').withData<{
  blockedUntil: Date;
}>() {}

export class InvalidOtpError extends CreateDomainError('invalid_otp') {}

export class OtpExpiredError extends CreateDomainError('otp_expired') {}

export class OtpThrottleError extends CreateDomainError('throttled').withData<{
  retryAfterSec: number;
}>() {}

export class RegistrationSessionMismatchError extends CreateDomainError(
  'registration_session_mismatch',
) {}

export class RegistractionError extends CreateDomainError('registration_error') {}
