import { Module } from '@nestjs/common';

import { DiscoveryModule } from '../features/discovery/discovery.module.js';
import { IdpModule } from '../features/idp/idp.module.js';
import { MediaModule } from '../features/media/media.module.js';
import { MainDbModule } from './db.module.js';
import { AuthModule } from '@/infra/auth/auth.module.js';
import { MainConfigModule } from '@/infra/config/module.js';

@Module({
  imports: [MainDbModule, MainConfigModule, AuthModule, IdpModule, MediaModule, DiscoveryModule],
})
export class AppModule {}
