import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

import { MainConfigService } from '@/infra/config/service.js';

import { OtpGeneratorService } from '../../application/ports.js';
import { OtpCode } from '../../domain/vo/otp.js';

@Injectable()
export class CryptoOtpGenerator extends OtpGeneratorService {
  public constructor(
    @Inject(MainConfigService) private readonly config: MainConfigService,
  ) {
    super();
  }

  public generate(): OtpCode {
    const code = this.config.get('TEST_OTP_CODE') ?? randomInt(100_000, 1_000_000).toString();
    return OtpCode.raw(code);
  }
}
