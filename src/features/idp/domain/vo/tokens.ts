import type { ValueObject } from '@/infra/ddd/value-object.js';

export type AccessToken = ValueObject<string, 'AccessToken'>;

export const AccessToken = {
  raw: (value: string): AccessToken => value as AccessToken,
};

export type RefreshToken = ValueObject<string, 'RefreshToken'>;

export const RefreshToken = {
  raw: (value: string): RefreshToken => value as RefreshToken,
};

export type TokenPair = {
  accessToken: AccessToken;
  refreshToken: RefreshToken;
};
