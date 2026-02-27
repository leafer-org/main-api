import { describe, expect, it } from 'vitest';

import { FingerPrint } from '../../vo/finger-print.js';
import { FullName } from '../../vo/full-name.js';
import { OtpCode, OtpCodeHash } from '../../vo/otp.js';
import { PhoneNumber } from '../../vo/phone-number.js';
import { loginProcessApply } from './apply.js';
import { LOGIN_PROCESS_CONFIG } from './config.js';
import type { LoginProcessId, LoginProcessState } from './state.js';
import type { UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const PHONE = PhoneNumber.raw('79991234567');
const FP = FingerPrint.fromIp('127.0.0.1');
const VALID_OTP = OtpCode.raw('123456');
const USER_ID = 'user-1' as UserId;
const PROCESS_ID = 'proc-1' as LoginProcessId;
const NOW = new Date('2024-06-01T12:00:00.000Z');

const makeOtpRequested = (): LoginProcessState => ({
  type: 'OtpRequested',
  id: PROCESS_ID,
  phoneNumber: PHONE,
  fingerPrint: FP,
  codeHash: OtpCodeHash.create(VALID_OTP),
  expiresAt: new Date(NOW.getTime() + LOGIN_PROCESS_CONFIG.OTP_CODE_EXPIRATION_MS),
  verifyAttempts: 0,
  requestedAt: NOW,
});

const makeNewRegistration = (): LoginProcessState => ({
  type: 'NewRegistration',
  id: PROCESS_ID,
  phoneNumber: PHONE,
  fingerPrint: FP,
  registrationSessionId: 'reg-session-abc',
});

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('loginProcessApply', () => {
  describe('login_process.started', () => {
    it('создаёт OtpRequested из null', () => {
      const state = loginProcessApply(null, {
        type: 'login_process.started',
        id: PROCESS_ID,
        otpCode: VALID_OTP,
        phoneNumber: PHONE,
        fingerPrint: FP,
        accuredAt: NOW,
        lastProcessId: null,
      });

      expect(state).toEqual({
        type: 'OtpRequested',
        id: PROCESS_ID,
        phoneNumber: PHONE,
        fingerPrint: FP,
        codeHash: OtpCodeHash.create(VALID_OTP),
        verifyAttempts: 0,
        expiresAt: new Date(NOW.getTime() + LOGIN_PROCESS_CONFIG.OTP_CODE_EXPIRATION_MS),
        requestedAt: NOW,
      });
    });
  });

  describe('login_process.otp_expired', () => {
    it('переводит в Errored', () => {
      const state = loginProcessApply(makeOtpRequested(), { type: 'login_process.otp_expired' });

      expect(state).toEqual({
        type: 'Errored',
        id: PROCESS_ID,
        phoneNumber: PHONE,
        fingerPrint: FP,
        error: 'otp_expired',
      });
    });
  });

  describe('login_process.otp_verify_failed', () => {
    it('инкрементирует verifyAttempts и устанавливает lastTryAt', () => {
      const state = loginProcessApply(makeOtpRequested(), {
        type: 'login_process.otp_verify_failed',
        lastTryAt: NOW,
      });

      expect(state).toEqual({
        ...makeOtpRequested(),
        verifyAttempts: 1,
        lastTryAt: NOW,
      });
    });

    it('корректно инкрементирует при повторных ошибках', () => {
      let state: LoginProcessState = makeOtpRequested();
      for (let i = 0; i < 3; i++) {
        state = loginProcessApply(state, {
          type: 'login_process.otp_verify_failed',
          lastTryAt: NOW,
        });
      }

      expect(state).toEqual({
        ...makeOtpRequested(),
        verifyAttempts: 3,
        lastTryAt: NOW,
      });
    });
  });

  describe('login_process.blocked', () => {
    it('переводит в Blocked', () => {
      const blockedUntil = new Date(NOW.getTime() + LOGIN_PROCESS_CONFIG.BLOCK_DURATION_MS);
      const state = loginProcessApply(makeOtpRequested(), {
        type: 'login_process.blocked',
        blockedUntil,
      });

      expect(state).toEqual({
        type: 'Blocked',
        id: PROCESS_ID,
        phoneNumber: PHONE,
        fingerPrint: FP,
        blockedUntil,
      });
    });
  });

  describe('login_process.new_registration', () => {
    it('переводит в NewRegistration', () => {
      const state = loginProcessApply(makeOtpRequested(), {
        type: 'login_process.new_registration',
        registrationSessionId: 'reg-123',
      });

      expect(state).toEqual({
        type: 'NewRegistration',
        id: PROCESS_ID,
        phoneNumber: PHONE,
        fingerPrint: FP,
        registrationSessionId: 'reg-123',
      });
    });
  });

  describe('login_process.completed', () => {
    it('переводит в Success', () => {
      const state = loginProcessApply(makeOtpRequested(), {
        type: 'login_process.completed',
        userId: USER_ID,
        role: 'USER' as Role,
        fingerPrint: FP,
      });

      expect(state).toEqual({
        type: 'Success',
        id: PROCESS_ID,
        phoneNumber: PHONE,
        fingerPrint: FP,
        userId: USER_ID,
      });
    });
  });

  describe('login_process.registration_completed', () => {
    it('переводит NewRegistration в Success', () => {
      const state = loginProcessApply(makeNewRegistration(), {
        type: 'login_process.registration_completed',
        userId: USER_ID,
        role: 'USER' as Role,
        fingerPrint: FP,
        phoneNumber: PHONE,
        fullName: FullName.raw('Иван Иванов'),
        avatarId: undefined,
      });

      expect(state).toEqual({
        type: 'Success',
        id: PROCESS_ID,
        phoneNumber: PHONE,
        fingerPrint: FP,
        userId: USER_ID,
      });
    });
  });
});
