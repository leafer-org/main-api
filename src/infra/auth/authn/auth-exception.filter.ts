import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Catches UnauthorizedException / ForbiddenException thrown by guards
 * and formats the response to match the OpenAPI `ErrorResponse` schema
 * ({ type, message?, data? }).
 */
@Catch(UnauthorizedException, ForbiddenException)
export class AuthExceptionFilter implements ExceptionFilter {
  public catch(exception: UnauthorizedException | ForbiddenException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const payload = exception.getResponse();

    const type =
      (typeof payload === 'object' && payload !== null && 'code' in payload
        ? (payload as Record<string, unknown>).code
        : undefined) ?? (status === 401 ? 'unauthorized' : 'forbidden');

    response.status(status).json({ type, isDomain: true });
  }
}
