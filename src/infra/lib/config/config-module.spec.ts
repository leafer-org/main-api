import { Injectable } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import Type from 'typebox';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigModule } from './config-module.js';
import { CreateConfigService } from './create-config-service.js';

const PORT = 3000;

describe('ConfigModule', () => {
  beforeEach(() => {
    process.env = {
      // biome-ignore lint/security/noSecrets: test data
      DB_URL: 'postgres://devuser:devpassword@localhost:5432/devdb',
      PORT: '3000',
    };
  });

  it('should provide config service', async () => {
    @Injectable()
    class ConfigService extends CreateConfigService({
      DB_URL: Type.String(),
    }) {}

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.register({
          ConfigService,
        }),
      ],
    }).compile();

    const svc = module.get(ConfigService);

    expect(svc).toBeDefined();
  });

  it('should return value if process.env valid', async () => {
    const schema = {
      DB_URL: Type.String({ format: 'uri' }),
    } as const;

    @Injectable()
    class ConfigService extends CreateConfigService(schema) {}

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.register({
          ConfigService,
        }),
      ],
    }).compile();

    const svc = module.get(ConfigService);

    expect(svc.get('DB_URL')).toBeDefined();
  });

  it('should throw validation error', async () => {
    process.env = {
      DB_URL: 'test',
    };

    expect(async () => {
      @Injectable()
      class ConfigService extends CreateConfigService({
        DB_URL: Type.String({ format: 'uri' }),
      }) {}

      await Test.createTestingModule({
        imports: [
          ConfigModule.register({
            ConfigService,
          }),
        ],
      }).compile();
    }).rejects.toThrowError('config invalid: #/properties/DB_URL -> must match format "uri"');
  });

  it('should transform values', async () => {
    @Injectable()
    class ConfigService extends CreateConfigService({
      DB_URL: Type.String({ format: 'uri' }),
      PORT: Type.Decode(Type.String(), (port) => parseInt(port, 10)),
      IS_ENABLED: Type.Decode(Type.String({ default: 'false' }), (v) => v === 'true'),
    }) {}

    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.register({
          ConfigService,
        }),
      ],
    }).compile();

    const configService = module.get(ConfigService);

    expect(configService.get('PORT')).toEqual(PORT);
    expect(configService.get('IS_ENABLED')).toEqual(false);
  });
});
