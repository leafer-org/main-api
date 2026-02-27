import { CreateDomainError } from '@/infra/ddd/error.js';

export class LoginBlockedError extends CreateDomainError('LoginBlocked').withData<{
  blockedUntil: Date;
}>() {}

export class InvalidOtpError extends CreateDomainError('InvalidOtpError') {}

export class OtpExpiredError extends CreateDomainError('OtpExpiredError') {}

export class OtpThrottleError extends CreateDomainError('OtpThrottle').withData<{
  retryAfterSec: number;
}>() {}

export class RegistrationSessionMismatchError extends CreateDomainError(
  'RegistrationSessionMismatch',
) {}

export class RegistractionError extends CreateDomainError('RegistrationError') {}
