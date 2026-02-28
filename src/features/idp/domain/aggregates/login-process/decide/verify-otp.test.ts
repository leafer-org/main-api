import { describe, expect, it } from 'vitest';

import { FingerPrint } from '../../../vo/finger-print.js';
import { OtpCode, OtpCodeHash } from '../../../vo/otp.js';
import { PhoneNumber } from '../../../vo/phone-number.js';
import type { VerifyOtpCommand } from '../commands.js';
import { LOGIN_PROCESS_CONFIG } from '../config.js';
import { InvalidOtpError, LoginBlockedError } from '../errors.js';
import type { LoginProcessId, LoginProcessState, RequestedLoginProcessState } from '../state.js';
import { verifyOtpDecide } from './verify-otp.js';
import type { EventId } from '@/infra/ddd/event.js';
import { Left, Right } from '@/infra/lib/box.js';
import { UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const PHONE = PhoneNumber.raw('79991234567');
const FP = FingerPrint.fromIp('127.0.0.1');
const VALID_OTP = OtpCode.raw('123456');
const WRONG_OTP = OtpCode.raw('000000');
const USER_ID = UserId.raw('user-1');
const PROCESS_ID = 'proc-1' as LoginProcessId;
const REG_SESSION = 'reg-session-abc';
const NOW = new Date('2024-06-01T12:00:00.000Z');

const makeCommand = (overrides?: Partial<VerifyOtpCommand>): VerifyOtpCommand => ({
  type: 'VerifyOtp',
  otpCode: VALID_OTP,
  now: NOW,
  registrationSessionId: REG_SESSION,
  user: undefined,
  generateEventId: () => 'evt-1' as EventId,
  ...overrides,
});

const makeOtpRequested = (
  otp: OtpCode = VALID_OTP,
  overrides?: Partial<RequestedLoginProcessState>,
): LoginProcessState => ({
  type: 'OtpRequested',
  id: PROCESS_ID,
  phoneNumber: PHONE,
  fingerPrint: FP,
  codeHash: OtpCodeHash.create(otp),
  expiresAt: new Date(NOW.getTime() + LOGIN_PROCESS_CONFIG.OTP_CODE_EXPIRATION_MS),
  verifyAttempts: 0,
  requestedAt: NOW,
  ...overrides,
});

const makeBlocked = (blockedUntil: Date): LoginProcessState => ({
  type: 'Blocked',
  id: PROCESS_ID,
  phoneNumber: PHONE,
  fingerPrint: FP,
  blockedUntil,
});

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('verifyOtpDecide', () => {
  describe('из состояния OtpRequested', () => {
    it('возвращает otp_expired если OTP истёк', () => {
      const state = makeOtpRequested();
      const afterExpiry = new Date(NOW.getTime() + LOGIN_PROCESS_CONFIG.OTP_CODE_EXPIRATION_MS + 1);
      const result = verifyOtpDecide(state, makeCommand({ now: afterExpiry }));

      expect(result).toEqual(Right({ type: 'login_process.otp_expired' }));
    });

    it('возвращает otp_verify_failed при неверном коде', () => {
      const state = makeOtpRequested();
      const result = verifyOtpDecide(state, makeCommand({ otpCode: WRONG_OTP }));

      expect(result).toEqual(Right({ type: 'login_process.otp_verify_failed', lastTryAt: NOW }));
    });

    it('возвращает blocked после MAX_OTP_ATTEMPTS неверных попыток', () => {
      const state = makeOtpRequested(VALID_OTP, {
        verifyAttempts: LOGIN_PROCESS_CONFIG.MAX_OTP_ATTEMPTS,
      });
      const result = verifyOtpDecide(state, makeCommand({ otpCode: WRONG_OTP }));

      expect(result).toEqual(
        Right({
          type: 'login_process.blocked',
          blockedUntil: new Date(NOW.getTime() + LOGIN_PROCESS_CONFIG.BLOCK_DURATION_MS),
        }),
      );
    });

    it('возвращает new_registration если код верный и пользователь не найден', () => {
      const state = makeOtpRequested();
      const result = verifyOtpDecide(state, makeCommand({ user: undefined }));

      expect(result).toEqual(
        Right({ type: 'login_process.new_registration', registrationSessionId: REG_SESSION }),
      );
    });

    it('возвращает completed если код верный и пользователь найден', () => {
      const state = makeOtpRequested();
      const result = verifyOtpDecide(
        state,
        makeCommand({ user: { id: USER_ID, role: Role.raw('USER') } }),
      );

      expect(result).toEqual(
        Right({
          type: 'login_process.completed',
          userId: USER_ID,
          role: Role.raw('USER'),
          fingerPrint: FP,
        }),
      );
    });
  });

  describe('из состояния Blocked', () => {
    it('возвращает LoginBlockedError если блокировка активна', () => {
      const blockedUntil = new Date(NOW.getTime() + 60_000);
      const result = verifyOtpDecide(makeBlocked(blockedUntil), makeCommand());

      expect(result).toEqual(Left(new LoginBlockedError({ blockedUntil })));
    });

    it('возвращает InvalidOtpError если блокировка истекла (невалидное состояние)', () => {
      const blockedUntil = new Date(NOW.getTime() - 1);
      const result = verifyOtpDecide(makeBlocked(blockedUntil), makeCommand());

      expect(result).toEqual(Left(new InvalidOtpError()));
    });
  });

  describe('из невалидных состояний', () => {
    it('возвращает InvalidOtpError для null', () => {
      expect(verifyOtpDecide(null, makeCommand())).toEqual(Left(new InvalidOtpError()));
    });

    it('возвращает InvalidOtpError для Success', () => {
      const state: LoginProcessState = {
        type: 'Success',
        id: PROCESS_ID,
        phoneNumber: PHONE,
        fingerPrint: FP,
        userId: USER_ID,
      };
      expect(verifyOtpDecide(state, makeCommand())).toEqual(Left(new InvalidOtpError()));
    });

    it('возвращает InvalidOtpError для NewRegistration', () => {
      const state: LoginProcessState = {
        type: 'NewRegistration',
        id: PROCESS_ID,
        phoneNumber: PHONE,
        fingerPrint: FP,
        registrationSessionId: REG_SESSION,
      };
      expect(verifyOtpDecide(state, makeCommand())).toEqual(Left(new InvalidOtpError()));
    });

    it('возвращает InvalidOtpError для Errored', () => {
      const state: LoginProcessState = {
        type: 'Errored',
        id: PROCESS_ID,
        phoneNumber: PHONE,
        fingerPrint: FP,
        error: 'otp_expired',
      };
      expect(verifyOtpDecide(state, makeCommand())).toEqual(Left(new InvalidOtpError()));
    });
  });
});
