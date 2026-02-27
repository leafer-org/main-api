import { Inject, Injectable } from '@nestjs/common';

import { loginProcessApply } from '../../../domain/aggregates/login-process/apply.js';
import { sendOtpCommandDecide } from '../../../domain/aggregates/login-process/decide/send-otp.js';
import type { LoginProcessStartedEvent } from '../../../domain/aggregates/login-process/events.js';
import type { LoginProcessState } from '../../../domain/aggregates/login-process/state.js';
import { FingerPrint } from '../../../domain/vo/finger-print.js';
import { PhoneNumber } from '../../../domain/vo/phone-number.js';
import {
  IdGenerator,
  LoginProcessRepository,
  OtpGeneratorService,
  OtpSenderService,
} from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import type { Clock } from '@/infra/lib/clock.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';

@Injectable()
export class CreateOtpInteractor {
  public constructor(
    private readonly clock: Clock,
    private readonly loginProcessRepository: LoginProcessRepository,
    private readonly otpGenerator: OtpGeneratorService,
    private readonly idGenerator: IdGenerator,
    private readonly sender: OtpSenderService,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  public async execute(command: { ip: string; phoneNumber: string }) {
    const parsedEither = this.parseCommand(command);
    if (isLeft(parsedEither)) return parsedEither;

    const { fingerPrint, phoneNumber } = parsedEither.value;
    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const latestState = await this.loginProcessRepository.findLatestBy(
        tx,
        phoneNumber,
        fingerPrint,
      );

      const otpCode = this.otpGenerator.generate();

      const eventEither = sendOtpCommandDecide(latestState, {
        type: 'CreateOtp',
        newLoginProcessId: this.idGenerator.generateLoginProcessId(),
        fingerPrint,
        now,
        otpCode,
        phoneNumber,
      });

      if (isLeft(eventEither)) return eventEither;

      const newLoginProcess = loginProcessApply(latestState, eventEither.value);

      await this.persist(tx, newLoginProcess, eventEither.value);
      await this.sender.send({ phoneNumber, code: otpCode });

      return Right('ok');
    });
  }

  private parseCommand(command: { ip: string; phoneNumber: string }) {
    const phoneNumberEither = PhoneNumber.create(command.phoneNumber);
    if (isLeft(phoneNumberEither)) return phoneNumberEither;

    return Right({
      phoneNumber: phoneNumberEither.value,
      fingerPrint: FingerPrint.fromIp(command.ip ?? ''),
    });
  }

  private async persist(
    tx: Transaction,
    state: LoginProcessState,
    event: LoginProcessStartedEvent,
  ) {
    await this.loginProcessRepository.save(tx, state);

    if (event.lastProcessId) {
      await this.loginProcessRepository.deleteById(tx, event.lastProcessId);
    }
  }
}
