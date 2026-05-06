import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { CentrifugoApiClient } from './centrifugo-api.client.js';
import { CentrifugoTokenService } from './centrifugo-token.service.js';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [CentrifugoApiClient, CentrifugoTokenService],
  exports: [CentrifugoApiClient, CentrifugoTokenService],
})
export class CentrifugoModule {}
