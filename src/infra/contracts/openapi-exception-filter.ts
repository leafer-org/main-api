import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import { type Response } from 'express';
import { HttpError } from 'express-openapi-validator/dist/framework/types.js';

@Catch(HttpError)
export class OpenApiExceptionFilter implements ExceptionFilter {
  public catch(exception: HttpError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    return response.status(exception.status).json({
      statusCode: exception.status,
      message: exception.message,
      errors: exception.errors,
    });
  }
}
