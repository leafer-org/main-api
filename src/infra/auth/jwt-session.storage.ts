import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

import type { JwtUserPayload } from './jwt-user-payload.js';

@Injectable()
export class JwtSessionStorage {
  public readonly store = new AsyncLocalStorage<JwtUserPayload>();

  public get(): JwtUserPayload | undefined {
    return this.store.getStore();
  }

  public getOrThrow(): JwtUserPayload {
    const payload = this.store.getStore();
    if (!payload) {
      throw new Error(
        'JwtSessionStorage: no session in current context. Was JwtAuthGuard applied?',
      );
    }
    return payload;
  }
}
