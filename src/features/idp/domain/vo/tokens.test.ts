import { describe, expect, it } from 'vitest';

import { AccessToken, RefreshToken } from './tokens.js';

describe('AccessToken', () => {
  it('should create branded value via raw', () => {
    expect(AccessToken.raw('some.jwt.token')).toBe('some.jwt.token');
  });
});

describe('RefreshToken', () => {
  it('should create branded value via raw', () => {
    expect(RefreshToken.raw('some.refresh.token')).toBe('some.refresh.token');
  });

  it('should distinguish two different tokens', () => {
    const t1 = RefreshToken.raw('token-1');
    const t2 = RefreshToken.raw('token-2');
    expect(t1).not.toBe(t2);
  });
});
