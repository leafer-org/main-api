import { register } from './entity/register.js';
import { sendOtp } from './entity/send-otp.js';
import { verifyOtp } from './entity/verify-otp.js';

export type { LoginProcessState } from './state.js';

export const LoginProcessEntity = { sendOtp, verifyOtp, register } as const;
