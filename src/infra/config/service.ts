import { Injectable } from '@nestjs/common';
import Type from 'typebox';

import { CreateConfigService } from '@/infra/lib/config/index.js';

const toInt = (p: string) => parseInt(p, 10);
const toBool = (p: string) => p === 'true';

@Injectable()
export class MainConfigService extends CreateConfigService({
  // Main app
  DB_URL: Type.String({ format: 'uri' }),
  PORT: Type.Decode(Type.String({ default: '3000' }), toInt),
  KAFKA_BROKER: Type.String(),
  KAFKA_SASL_USERNAME: Type.String(),
  KAFKA_SASL_PASSWORD: Type.String(),
  // IDP — JWT
  IDP_JWT_SECRET: Type.String(),
  IDP_JWT_ISSUER: Type.Optional(Type.String()),
  IDP_ACCESS_TOKEN_TTL_SEC: Type.Decode(Type.String({ default: '900' }), toInt),
  IDP_REFRESH_TOKEN_TTL_SEC: Type.Decode(Type.String({ default: '2592000' }), toInt),
  IDP_REFRESH_TOKEN_COOKIE: Type.String({ default: 'idp_refresh_token' }),
  // IDP — OTP
  OTP_CODE_LENGTH: Type.Decode(Type.String({ default: '6' }), toInt),
  OTP_TTL_SEC: Type.Decode(Type.String({ default: '300' }), toInt),
  OTP_THROTTLE_SEC: Type.Decode(Type.String({ default: '60' }), toInt),
  OTP_MAX_ATTEMPTS: Type.Decode(Type.String({ default: '5' }), toInt),
  // IDP — SMS
  SMS_PROVIDER: Type.Union([Type.Literal('mock'), Type.Literal('twilio'), Type.Literal('vonage')], {
    default: 'mock',
  }),
  SMS_API_KEY: Type.Optional(Type.String()),
  SMS_API_SECRET: Type.Optional(Type.String()),
  SMS_FROM: Type.String({ default: 'Leafer' }),
  // IDP — S3 / Media
  S3_ENDPOINT: Type.Optional(Type.String()),
  S3_REGION: Type.String({ default: 'us-east-1' }),
  S3_BUCKET: Type.Optional(Type.String()),
  S3_ACCESS_KEY: Type.Optional(Type.String()),
  S3_SECRET_KEY: Type.Optional(Type.String()),
  S3_FORCE_PATH_STYLE: Type.Decode(Type.String({ default: 'true' }), toBool),
  MEDIA_PUBLIC_CDN_URL: Type.Optional(Type.String()),
  MEDIA_IMAGE_PROXY_URL: Type.Optional(Type.String()),
  MEDIA_BUCKET_PUBLIC: Type.Optional(Type.String()),
  MEDIA_BUCKET_PRIVATE: Type.Optional(Type.String()),
}) {}
