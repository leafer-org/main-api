import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { OtpGeneratorService } from '../../application/ports.js';
import { OtpCode } from '../../domain/vo/otp.js';

@Injectable()
export class CryptoOtpGenerator extends OtpGeneratorService {
  public generate(): OtpCode {
    const code = randomInt(100_000, 1_000_000).toString();
    return OtpCode.raw(code);
  }
}
