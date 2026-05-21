import { HttpException } from '@nestjs/common';

export function throwDomainError(error: { toResponse(): Record<number, unknown> }): never {
  const response = error.toResponse();
  const [statusCode] = Object.keys(response);
  throw new HttpException(
    response[Number(statusCode)] as Record<string, unknown>,
    Number(statusCode),
  );
}
