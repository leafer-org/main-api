import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';

import { MediaProcessorModule } from '../features/media/media-processor.module.js';
import { MainDbModule } from './db.module.js';
import { MainRedisModule } from './redis.module.js';
import { MainConfigModule } from '@/infra/config/module.js';

@Module({
  imports: [
    ClsModule.forRoot({ global: true }),
    MainConfigModule,
    MainDbModule,
    MainRedisModule,
    MediaProcessorModule,
  ],
})
export class FileProcessorModule {}
