import type { OtpCode } from './otp.js';

export const formatOtpMessage = (otp: OtpCode, locale?: string): string => {
  switch (locale) {
    case 'en':
    case 'en-US':
      return `Your Leafer verification code is ${otp}`;
    default:
      return `Код подтверждения Leafer: ${otp}`;
  }
};
