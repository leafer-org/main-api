import { ForbiddenException } from '@nestjs/common';

export class PermissionDeniedException extends ForbiddenException {
  public constructor(
    public readonly action: string,
    public readonly role: string,
  ) {
    super();
  }
}
