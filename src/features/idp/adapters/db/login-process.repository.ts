/** biome-ignore-all lint/style/noNonNullAssertion: Not null asertion */
import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { LoginProcessRepository } from '../../application/ports.js';
import type {
  LoginProcessId,
  LoginProcessState,
} from '../../domain/aggregates/login-process/state.js';
import { FingerPrint } from '../../domain/vo/finger-print.js';
import { OtpCodeHash } from '../../domain/vo/otp.js';
import { PhoneNumber } from '../../domain/vo/phone-number.js';
import { loginProcesses } from './schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { assertNever } from '@/infra/ddd/utils.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { UserId } from '@/kernel/domain/ids.js';

type LoginProcessRow = typeof loginProcesses.$inferSelect;

@Injectable()
export class DrizzleLoginProcessRepository extends LoginProcessRepository {
  public constructor(private readonly txHost: TransactionHostPg) {
    super();
  }

  public async findLatestBy(
    tx: Transaction,
    phoneNumber: PhoneNumber,
    fingerPrint: FingerPrint,
  ): Promise<LoginProcessState | null> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select()
      .from(loginProcesses)
      .where(
        and(
          eq(loginProcesses.phoneNumber, phoneNumber as string),
          eq(loginProcesses.ip, fingerPrint as string),
        ),
      )
      .orderBy(desc(loginProcesses.requestedAt))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return this.toDomain(row);
  }

  public async findByRegistrationSessionId(
    tx: Transaction,
    sessionId: string,
  ): Promise<LoginProcessState | null> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select()
      .from(loginProcesses)
      .where(
        and(
          eq(loginProcesses.registrationSessionId, sessionId),
          eq(loginProcesses.type, 'NewRegistration'),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return this.toDomain(row);
  }

  public async save(tx: Transaction, state: LoginProcessState): Promise<void> {
    const db = this.txHost.get(tx);
    const values = this.toRow(state);

    await db.insert(loginProcesses).values(values).onConflictDoUpdate({
      target: loginProcesses.id,
      set: values,
    });
  }

  public async deleteById(tx: Transaction, id: LoginProcessId): Promise<void> {
    const db = this.txHost.get(tx);
    await db.delete(loginProcesses).where(eq(loginProcesses.id, id));
  }

  private toDomain(row: LoginProcessRow): LoginProcessState {
    const base = {
      id: row.id as LoginProcessId,
      phoneNumber: PhoneNumber.raw(row.phoneNumber),
      fingerPrint: FingerPrint.raw(row.ip ?? ''),
    };

    switch (row.type) {
      case 'OtpRequested':
        return {
          ...base,
          type: 'OtpRequested',
          codeHash: OtpCodeHash.raw(row.codeHash!),
          expiresAt: row.expiresAt!,
          verifyAttempts: row.attempts,
          requestedAt: row.requestedAt,
          lastTryAt: row.lastTryAt ?? undefined,
        };
      case 'NewRegistration':
        return {
          ...base,
          type: 'NewRegistration',
          registrationSessionId: row.registrationSessionId!,
        };
      case 'Success':
        return {
          ...base,
          type: 'Success',
          userId: row.userId as UserId,
        };
      case 'Blocked':
        return {
          ...base,
          type: 'Blocked',
          blockedUntil: row.blockedUntil!,
        };
      case 'Errored':
        return {
          ...base,
          type: 'Errored',
          error: row.error as 'otp_expired',
        };
      default:
        throw new Error(`Unknown login process type: ${row.type}`);
    }
  }

  private toRow(state: LoginProcessState) {
    const base = {
      id: state.id,
      type: state.type,
      phoneNumber: state.phoneNumber as string,
      ip: state.fingerPrint as string,
    };

    switch (state.type) {
      case 'OtpRequested':
        return {
          ...base,
          codeHash: state.codeHash as string,
          expiresAt: state.expiresAt,
          requestedAt: state.requestedAt,
          attempts: state.verifyAttempts,
          lastTryAt: state.lastTryAt ?? null,
          registrationSessionId: null,
          userId: null,
          blockedUntil: null,
          error: null,
        };
      case 'NewRegistration':
        return {
          ...base,
          codeHash: null,
          expiresAt: null,
          requestedAt: new Date(),
          attempts: 0,
          lastTryAt: null,
          registrationSessionId: state.registrationSessionId,
          userId: null,
          blockedUntil: null,
          error: null,
        };
      case 'Success':
        return {
          ...base,
          codeHash: null,
          expiresAt: null,
          requestedAt: new Date(),
          attempts: 0,
          lastTryAt: null,
          registrationSessionId: null,
          userId: state.userId,
          blockedUntil: null,
          error: null,
        };
      case 'Blocked':
        return {
          ...base,
          codeHash: null,
          expiresAt: null,
          requestedAt: new Date(),
          attempts: 0,
          lastTryAt: null,
          registrationSessionId: null,
          userId: null,
          blockedUntil: state.blockedUntil,
          error: null,
        };
      case 'Errored':
        return {
          ...base,
          codeHash: null,
          expiresAt: null,
          requestedAt: new Date(),
          attempts: 0,
          lastTryAt: null,
          registrationSessionId: null,
          userId: null,
          blockedUntil: null,
          error: state.error,
        };

      default:
        assertNever(state);
    }
  }
}
