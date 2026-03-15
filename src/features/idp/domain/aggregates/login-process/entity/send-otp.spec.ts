import { describe, expect, it } from 'vitest';

import { FingerPrint } from '../../../vo/finger-print.js';
import { OtpCode, OtpCodeHash } from '../../../vo/otp.js';
import { PhoneNumber } from '../../../vo/phone-number.js';
import type { CreateOtpCommand } from '../commands.js';
import { LOGIN_PROCESS_CONFIG } from '../config.js';
import { LoginBlockedError, OtpThrottleError } from '../errors.js';
import type { LoginProcessId, LoginProcessState, RequestedLoginProcessState } from '../state.js';
import { sendOtp } from './send-otp.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const PHONE = PhoneNumber.raw('79991234567');
const FP = FingerPrint.fromIp('127.0.0.1');
const OTP = OtpCode.raw('123456');
const PROCESS_ID = 'proc-1' as LoginProcessId;
const NEW_PROCESS_ID = 'proc-2' as LoginProcessId;
const NOW = new Date('2024-06-01T12:00:00.000Z');

const makeCommand = (overrides?: Partial<CreateOtpCommand>): CreateOtpCommand => ({
  type: 'CreateOtp',
  newLoginProcessId: NEW_PROCESS_ID,
  now: NOW,
  phoneNumber: PHONE,
  otpCode: OTP,
  fingerPrint: FP,
  ...overrides,
});

const makeOtpRequested = (overrides?: Partial<RequestedLoginProcessState>): LoginProcessState => ({
  type: 'OtpRequested',
  id: PROCESS_ID,
  phoneNumber: PHONE,
  fingerPrint: FP,
  codeHash: '' as never,
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

describe('LoginProcessEntity.sendOtp', () => {
  describe('без предыдущего состояния (state = null)', () => {
    it('возвращает state и event', () => {
      const result = sendOtp(null, makeCommand());

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.event).toEqual({
          type: 'login_process.started',
          id: NEW_PROCESS_ID,
          phoneNumber: PHONE,
          fingerPrint: FP,
          accuredAt: NOW,
          lastProcessId: null,
          otpCode: OTP,
        });
        expect(result.value.state).toEqual({
          type: 'OtpRequested',
          id: NEW_PROCESS_ID,
          phoneNumber: PHONE,
          fingerPrint: FP,
          codeHash: OtpCodeHash.create(OTP),
          verifyAttempts: 0,
          expiresAt: new Date(NOW.getTime() + LOGIN_PROCESS_CONFIG.OTP_CODE_EXPIRATION_MS),
          requestedAt: NOW,
        });
      }
    });
  });

  describe('предыдущее состояние Blocked', () => {
    it('возвращает LoginBlockedError если блокировка активна', () => {
      const blockedUntil = new Date(NOW.getTime() + 10_000);
      const result = sendOtp(makeBlocked(blockedUntil), makeCommand());

      expect(result).toEqual(
        Left(new LoginBlockedError({ blockedUntil: blockedUntil.toISOString() })),
      );
    });

    it('создаёт новый процесс если блокировка истекла', () => {
      const blockedUntil = new Date(NOW.getTime() - 1);
      const result = sendOtp(makeBlocked(blockedUntil), makeCommand());

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.event.lastProcessId).toBe(PROCESS_ID);
      }
    });
  });

  describe('предыдущее состояние OtpRequested', () => {
    it('возвращает OtpThrottleError если throttle не истёк', () => {
      const state = makeOtpRequested({ requestedAt: NOW });
      const laterNow = new Date(NOW.getTime() + 30_000);
      const result = sendOtp(state, makeCommand({ now: laterNow }));

      expect(result).toEqual(Left(new OtpThrottleError({ retryAfterSec: 30 })));
    });

    it('создаёт новый процесс если throttle истёк', () => {
      const state = makeOtpRequested({ requestedAt: NOW });
      const laterNow = new Date(NOW.getTime() + LOGIN_PROCESS_CONFIG.OTP_THROTTLE_MS + 1);
      const result = sendOtp(state, makeCommand({ now: laterNow }));

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.event.type).toBe('login_process.started');
        expect(result.value.state.type).toBe('OtpRequested');
        expect(result.value.state.id).toBe(NEW_PROCESS_ID);
        expect(result.value.event.id).toBe(NEW_PROCESS_ID);
        expect(result.value.event.lastProcessId).toBe(PROCESS_ID);
        // new id must differ from lastProcessId so persist() won't delete the just-saved process
        expect(result.value.state.id).not.toBe(result.value.event.lastProcessId);
      }
    });
  });

  describe('терминальные состояния', () => {
    it('создаёт новый процесс из Success', () => {
      const state: LoginProcessState = {
        type: 'Success',
        id: PROCESS_ID,
        phoneNumber: PHONE,
        fingerPrint: FP,
        userId: 'user-1' as never,
      };
      const result = sendOtp(state, makeCommand());

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.event.lastProcessId).toBe(PROCESS_ID);
      }
    });
  });
});
