import { Injectable, Logger } from '@nestjs/common';

import { OtpSenderService, type SmsChannel } from '../../application/ports.js';

@Injectable()
export class MockOtpSender extends OtpSenderService {
  private readonly logger = new Logger(MockOtpSender.name);

  public async send(params: {
    phoneNumber: string;
    code: string;
    channel?: SmsChannel;
    locale?: string;
  }): Promise<void> {
    this.logger.log(`[MOCK SMS] to=${params.phoneNumber} code=${params.code}`);
  }
}
