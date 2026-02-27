import { Module } from '@nestjs/common';

import { IdpModule } from '../features/idp/idp.module.js';
import { MediaModule } from '../features/media/media.module.js';
import { MainDbModule } from '../infra/db/module.js';
import { MainConfigModule } from '@/infra/config/module.js';

@Module({
  imports: [MainDbModule, MainConfigModule, IdpModule, MediaModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
