import type {
  LoginProcessId,
  LoginProcessState,
} from '../domain/aggregates/login-process/state.js';
import type { SessionState } from '../domain/aggregates/session/state.js';
import type { RefreshTokenPayload } from '../domain/aggregates/session/token.types.js';
import type { UserState } from '../domain/aggregates/user/state.js';
import type { MeReadModel } from '../domain/read-models/me.read-model.js';
import type { UserSessionsReadModel } from '../domain/read-models/user-sessions.read-model.js';
import type { FingerPrint } from '../domain/vo/finger-print.js';
import type { OtpCode } from '../domain/vo/otp.js';
import type { PhoneNumber } from '../domain/vo/phone-number.js';
import type { AccessToken, RefreshToken } from '../domain/vo/tokens.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { SessionId, UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo.js';

// --- Shared types ---

export type SmsChannel = 'sms' | 'call';

export interface MediaRecord {
  key: string;
  url: string;
  mimeType: string;
}

// --- Aggregate repository ports (write-side, state-based, transactional) ---

export abstract class LoginProcessRepository {
  public abstract findLatestBy(
    tx: Transaction,
    phoneNumber: PhoneNumber,
    fingerPrint: FingerPrint,
  ): Promise<LoginProcessState | null>;

  public abstract findByRegistrationSessionId(
    tx: Transaction,
    sessionId: string,
  ): Promise<LoginProcessState | null>;

  public abstract save(tx: Transaction, state: LoginProcessState): Promise<void>;
  public abstract deleteById(tx: Transaction, id: LoginProcessId): Promise<void>;
}

export abstract class UserRepository {
  public abstract findById(tx: Transaction, userId: UserId): Promise<UserState | null>;
  public abstract findByPhoneNumber(
    tx: Transaction,
    phoneNumber: PhoneNumber,
  ): Promise<{ id: UserId; role: Role } | null>;
  public abstract save(tx: Transaction, state: UserState): Promise<void>;
}

export abstract class SessionRepository {
  public abstract findById(tx: Transaction, sessionId: SessionId): Promise<SessionState | null>;
  public abstract save(tx: Transaction, state: SessionState): Promise<void>;
  public abstract deleteById(tx: Transaction, sessionId: SessionId): Promise<void>;
  public abstract deleteAllByUserIdExcept(
    tx: Transaction,
    userId: UserId,
    excludeSessionId: SessionId,
  ): Promise<void>;
}

// --- Read-model ports (read-side, no transactions, return domain read models) ---

export abstract class MeQueryPort {
  public abstract findMe(userId: UserId, sessionId: SessionId): Promise<MeReadModel | null>;
}

export abstract class UserSessionsQueryPort {
  public abstract findUserSessions(userId: UserId): Promise<UserSessionsReadModel>;
}

// --- Service ports ---

export abstract class JwtAccessService {
  public abstract sign(payload: { userId: UserId; role: Role; sessionId: string }): AccessToken;
}

export abstract class RefreshTokenService {
  public abstract verify(token: string): RefreshTokenPayload;
  public abstract sign(payload: RefreshTokenPayload): RefreshToken;
}

export abstract class OtpGeneratorService {
  public abstract generate(): OtpCode;
}

export abstract class OtpSenderService {
  public abstract send(params: {
    phoneNumber: string;
    code: string;
    channel?: SmsChannel;
    locale?: string;
  }): Promise<void>;
}

export abstract class IdGenerator {
  public abstract generateLoginProcessId(): LoginProcessId;
  public abstract generateUserId(): UserId;
  public abstract generateSessionId(): SessionId;
}
