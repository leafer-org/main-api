import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { JwtUserPayload } from './jwt-auth.guard.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUserPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user: JwtUserPayload }>();
    return request.user;
  },
);
