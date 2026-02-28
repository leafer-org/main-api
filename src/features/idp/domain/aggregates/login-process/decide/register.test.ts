import { describe, expect, it } from 'vitest';

import { FingerPrint } from '../../../vo/finger-print.js';
import { FullName } from '../../../vo/full-name.js';
import { OtpCode, OtpCodeHash } from '../../../vo/otp.js';
import { PhoneNumber } from '../../../vo/phone-number.js';
import type { RegisterCommand } from '../commands.js';
import { LOGIN_PROCESS_CONFIG } from '../config.js';
import { RegistractionError, RegistrationSessionMismatchError } from '../errors.js';
import type { LoginProcessId, LoginProcessState } from '../state.js';
import { registerDecide } from './register.js';
import type { EventId } from '@/infra/ddd/event.js';
import { Left, Right } from '@/infra/lib/box.js';
import { UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const PHONE = PhoneNumber.raw('79991234567');
const FP = FingerPrint.fromIp('127.0.0.1');
const USER_ID = UserId.raw('user-1');
const PROCESS_ID = 'proc-1' as LoginProcessId;
const REG_SESSION = 'reg-session-abc';
const FULL_NAME = FullName.raw('Иван Иванов');
const NOW = new Date('2024-06-01T12:00:00.000Z');

const makeNewRegistration = (): LoginProcessState => ({
  type: 'NewRegistration',
  id: PROCESS_ID,
  phoneNumber: PHONE,
  fingerPrint: FP,
  registrationSessionId: REG_SESSION,
});

const makeCommand = (overrides?: Partial<RegisterCommand>): RegisterCommand => ({
  type: 'Register',
  newUserId: USER_ID,
  role: Role.raw('USER'),
  fullName: FULL_NAME,
  avatarId: undefined,
  registrationSessionId: REG_SESSION,
  fingerPrint: FP,
  now: NOW,
  createEventId: () => 'evt-1' as EventId,
  ...overrides,
});

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('registerDecide', () => {
  it('возвращает registration_completed при корректных данных', () => {
    const result = registerDecide(makeNewRegistration(), makeCommand());

    expect(result).toEqual(
      Right({
        type: 'login_process.registration_completed',
        userId: USER_ID,
        role: Role.raw('USER'),
        fingerPrint: FP,
        phoneNumber: PHONE,
        fullName: FULL_NAME,
        avatarId: undefined,
      }),
    );
  });

  it('возвращает RegistrationSessionMismatchError при неверном registrationSessionId', () => {
    const result = registerDecide(
      makeNewRegistration(),
      makeCommand({ registrationSessionId: 'wrong-session' }),
    );

    expect(result).toEqual(Left(new RegistrationSessionMismatchError()));
  });

  it('возвращает RegistrationSessionMismatchError при неверном fingerPrint', () => {
    const result = registerDecide(
      makeNewRegistration(),
      makeCommand({ fingerPrint: FingerPrint.fromIp('192.168.1.1') }),
    );

    expect(result).toEqual(Left(new RegistrationSessionMismatchError()));
  });

  describe('из невалидных состояний', () => {
    it('возвращает RegistractionError для null', () => {
      expect(registerDecide(null, makeCommand())).toEqual(Left(new RegistractionError()));
    });

    it('возвращает RegistractionError для OtpRequested', () => {
      const state: LoginProcessState = {
        type: 'OtpRequested',
        id: PROCESS_ID,
        phoneNumber: PHONE,
        fingerPrint: FP,
        codeHash: OtpCodeHash.create(OtpCode.raw('123456')),
        expiresAt: new Date(NOW.getTime() + LOGIN_PROCESS_CONFIG.OTP_CODE_EXPIRATION_MS),
        verifyAttempts: 0,
        requestedAt: NOW,
      };

      expect(registerDecide(state, makeCommand())).toEqual(Left(new RegistractionError()));
    });

    it('возвращает RegistractionError для Success', () => {
      const state: LoginProcessState = {
        type: 'Success',
        id: PROCESS_ID,
        phoneNumber: PHONE,
        fingerPrint: FP,
        userId: USER_ID,
      };

      expect(registerDecide(state, makeCommand())).toEqual(Left(new RegistractionError()));
    });
  });
});
