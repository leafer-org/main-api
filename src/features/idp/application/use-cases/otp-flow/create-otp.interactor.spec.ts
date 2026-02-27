import { describe, expect, it } from 'vitest';

import { LOGIN_PROCESS_CONFIG } from '../../../domain/aggregates/login-process/config.js';
import { LoginBlockedError } from '../../../domain/aggregates/login-process/errors.js';
import type {
  LoginProcessId,
  LoginProcessState,
} from '../../../domain/aggregates/login-process/state.js';
import { FingerPrint } from '../../../domain/vo/finger-print.js';
import { OtpCode, OtpCodeHash } from '../../../domain/vo/otp.js';
import { PhoneNumber } from '../../../domain/vo/phone-number.js';
import type {
  IdGenerator,
  LoginProcessRepository,
  OtpGeneratorService,
  OtpSenderService,
} from '../../ports.js';
import { CreateOtpInteractor } from './create-otp.interactor.js';
import { isLeft, isRight } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { MockTransactionHost, ServiceMock } from '@/infra/test/mock.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const PHONE = '79991234567';
const IP = '127.0.0.1';
const NOW = new Date('2024-06-01T12:00:00.000Z');
const OTP = OtpCode.raw('123456');
const PROCESS_ID = 'proc-1' as LoginProcessId;

const makeClock = () => {
  const clock = ServiceMock<Clock>();
  clock.now.mockReturnValue(NOW);
  return clock;
};

const makeBlocked = (): LoginProcessState => ({
  type: 'Blocked',
  id: PROCESS_ID,
  phoneNumber: PhoneNumber.raw(PHONE),
  fingerPrint: FingerPrint.fromIp(IP),
  blockedUntil: new Date(NOW.getTime() + LOGIN_PROCESS_CONFIG.BLOCK_DURATION_MS),
});

const makeDeps = () => {
  const loginProcessRepo = ServiceMock<LoginProcessRepository>();
  loginProcessRepo.findLatestBy.mockResolvedValue(null);
  loginProcessRepo.save.mockResolvedValue(undefined);
  loginProcessRepo.deleteById.mockResolvedValue(undefined);

  const otpGenerator = ServiceMock<OtpGeneratorService>();
  otpGenerator.generate.mockReturnValue(OTP);

  const idGenerator = ServiceMock<IdGenerator>();
  idGenerator.generateLoginProcessId.mockReturnValue(PROCESS_ID);

  const sender = ServiceMock<OtpSenderService>();
  sender.send.mockResolvedValue(undefined);

  return { loginProcessRepo, otpGenerator, idGenerator, sender };
};

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('CreateOtpInteractor', () => {
  it('создаёт OTP, сохраняет процесс и отправляет SMS', async () => {
    const { loginProcessRepo, otpGenerator, idGenerator, sender } = makeDeps();
    const txHost = new MockTransactionHost();

    const interactor = new CreateOtpInteractor(
      makeClock(),
      loginProcessRepo,
      otpGenerator,
      idGenerator,
      sender,
      txHost,
    );

    const result = await interactor.execute({ ip: IP, phoneNumber: PHONE });

    expect(isRight(result)).toBe(true);
    expect(loginProcessRepo.save).toHaveBeenCalledWith(
      txHost.transaction,
      expect.objectContaining({
        type: 'OtpRequested',
        id: PROCESS_ID,
        phoneNumber: PhoneNumber.raw(PHONE),
        codeHash: OtpCodeHash.create(OTP),
      }),
    );
    expect(sender.send).toHaveBeenCalledWith({
      phoneNumber: PhoneNumber.raw(PHONE),
      code: OTP,
    });
  });

  it('удаляет предыдущий процесс если он существовал', async () => {
    const OLD_PROCESS_ID = 'proc-old' as LoginProcessId;
    const { loginProcessRepo, otpGenerator, idGenerator, sender } = makeDeps();
    const txHost = new MockTransactionHost();

    // Существующий процесс с истёкшим throttle
    loginProcessRepo.findLatestBy.mockResolvedValue({
      type: 'Success',
      id: OLD_PROCESS_ID,
      phoneNumber: PhoneNumber.raw(PHONE),
      fingerPrint: FingerPrint.fromIp(IP),
      userId: 'user-1' as never,
    });

    const interactor = new CreateOtpInteractor(
      makeClock(),
      loginProcessRepo,
      otpGenerator,
      idGenerator,
      sender,
      txHost,
    );

    await interactor.execute({ ip: IP, phoneNumber: PHONE });

    expect(loginProcessRepo.deleteById).toHaveBeenCalledWith(txHost.transaction, OLD_PROCESS_ID);
  });

  it('не вызывает deleteById если предыдущего процесса нет', async () => {
    const { loginProcessRepo, otpGenerator, idGenerator, sender } = makeDeps();
    // findLatestBy уже возвращает null по умолчанию

    const interactor = new CreateOtpInteractor(
      makeClock(),
      loginProcessRepo,
      otpGenerator,
      idGenerator,
      sender,
      new MockTransactionHost(),
    );

    await interactor.execute({ ip: IP, phoneNumber: PHONE });

    expect(loginProcessRepo.deleteById).not.toHaveBeenCalled();
  });

  it('возвращает ошибку при невалидном номере телефона', async () => {
    const { loginProcessRepo, otpGenerator, idGenerator, sender } = makeDeps();

    const interactor = new CreateOtpInteractor(
      makeClock(),
      loginProcessRepo,
      otpGenerator,
      idGenerator,
      sender,
      new MockTransactionHost(),
    );

    const result = await interactor.execute({ ip: IP, phoneNumber: 'invalid' });

    expect(isLeft(result)).toBe(true);
    expect(loginProcessRepo.save).not.toHaveBeenCalled();
  });

  it('возвращает LoginBlockedError если пользователь заблокирован', async () => {
    const { loginProcessRepo, otpGenerator, idGenerator, sender } = makeDeps();
    loginProcessRepo.findLatestBy.mockResolvedValue(makeBlocked());

    const interactor = new CreateOtpInteractor(
      makeClock(),
      loginProcessRepo,
      otpGenerator,
      idGenerator,
      sender,
      new MockTransactionHost(),
    );

    const result = await interactor.execute({ ip: IP, phoneNumber: PHONE });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(LoginBlockedError);
    }
  });
});
