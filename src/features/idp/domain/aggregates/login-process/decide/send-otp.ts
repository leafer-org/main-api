import type { CreateOtpCommand } from '../commands.js';
import { LOGIN_PROCESS_CONFIG } from '../config.js';
import { LoginBlockedError, OtpThrottleError } from '../errors.js';
import type { LoginProcessStartedEvent } from '../events.js';
import { type LoginProcessState } from '../state.js';
import { assertNever } from '@/infra/ddd/utils.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export function sendOtpCommandDecide(
  state: LoginProcessState | null,
  command: CreateOtpCommand,
): Either<LoginBlockedError | OtpThrottleError, LoginProcessStartedEvent> {
  // Обрабатываем, всю блокировку, которая ещё активна
  if (state?.type === 'Blocked' && state.blockedUntil.getTime() > command.now.getTime()) {
    return Left(new LoginBlockedError({ blockedUntil: state.blockedUntil }));
  }

  // Если пользователь ещё не входил
  // Если пользователь уже входил, но процесс был завершён (success, errored, истёнкая блокировка)
  // Если пользователь прервал регистрацию
  // Мы начинает заново
  if (
    !state ||
    state.type === 'Errored' ||
    state.type === 'Success' ||
    state.type === 'Blocked' ||
    state.type === 'NewRegistration'
  ) {
    const loginProcessStarted: LoginProcessStartedEvent = {
      type: 'login_process.started',
      id: command.newLoginProcessId,
      phoneNumber: command.phoneNumber,
      fingerPrint: command.fingerPrint,
      accuredAt: command.now,
      lastProcessId: state?.id ?? null,
      otpCode: command.otpCode,
    };
    return Right(loginProcessStarted);
  }

  // Если пользователь уже высылал номер
  if (state?.type === 'OtpRequested') {
    // Проверяем троттлинг
    const elapsed = command.now.getTime() - state.requestedAt.getTime();
    if (elapsed < LOGIN_PROCESS_CONFIG.OTP_THROTTLE_MS) {
      const retryAfterSec = Math.ceil((LOGIN_PROCESS_CONFIG.OTP_THROTTLE_MS - elapsed) / 1000);
      return Left(new OtpThrottleError({ retryAfterSec }));
    }

    // Начинаем заново, так как пользователь запрашивает новый код, а значит старый уже не нужен
    const loginProcessStarted: LoginProcessStartedEvent = {
      type: 'login_process.started',
      id: state.id,
      phoneNumber: command.phoneNumber,
      fingerPrint: command.fingerPrint,
      accuredAt: command.now,
      lastProcessId: state.id,
      otpCode: command.otpCode,
    };

    return Right(loginProcessStarted);
  }

  assertNever(state);
}
