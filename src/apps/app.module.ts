import { Module } from '@nestjs/common';

import { IdpModule } from '../features/idp/idp.module.js';
import { MediaModule } from '../features/media/media.module.js';
import { MainDbModule } from './db.module.js';
import { AuthModule } from '@/infra/auth/auth.module.js';
import { MainConfigModule } from '@/infra/config/module.js';

@Module({
  imports: [MainDbModule, MainConfigModule, AuthModule, IdpModule, MediaModule],
})
export class AppModule {}
