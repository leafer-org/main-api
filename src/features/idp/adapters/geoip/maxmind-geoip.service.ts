import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Reader, type ReaderModel } from '@maxmind/geoip2-node';

import { GeoIpService } from '../../application/ports.js';
import { MainConfigService } from '@/infra/config/service.js';

@Injectable()
export class MaxMindGeoIpService implements GeoIpService, OnModuleInit {
  private readonly logger = new Logger(MaxMindGeoIpService.name);
  private reader: ReaderModel | null = null;

  public constructor(
    @Inject(MainConfigService)
    private readonly config: MainConfigService,
  ) {}

  public async onModuleInit(): Promise<void> {
    const dbPath = this.config.get('MAXMIND_DB_PATH');
    if (!dbPath) {
      this.logger.warn('MAXMIND_DB_PATH not configured — GeoIP lookups will return nulls');
      return;
    }

    try {
      this.reader = await Reader.open(dbPath);
      this.logger.log('MaxMind GeoIP database loaded');
    } catch (error) {
      this.logger.warn(`Failed to load MaxMind DB at ${dbPath}: ${error}`);
    }
  }

  public async lookup(ip: string): Promise<{ city: string | null; country: string | null }> {
    if (!this.reader || !ip) {
      return { city: null, country: null };
    }

    try {
      const response = this.reader.city(ip);
      console.log(response)
      return {
        city: response.city?.names?.ru ?? response.city?.names?.en ?? null,
        country: response.country?.names?.ru ?? response.country?.names?.en ?? null,
      };
    } catch {
      return { city: null, country: null };
    }
  }
}
