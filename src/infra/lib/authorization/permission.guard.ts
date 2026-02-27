import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PermissionDeniedException } from './permission-denied.exception.js';
import { PermissionService } from './permission-service.js';
import {
  PERMISSION_METADATA_KEY,
  type PermissionMetadata,
} from './require-permission.decorator.js';
import { SessionContext } from './session-context.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
    private readonly sessionContext: SessionContext,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const metadata = this.reflector.getAllAndOverride<PermissionMetadata>(PERMISSION_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!metadata) {
      return true;
    }

    const can = this.permissionService.can.bind(this.permissionService);
    const hasPermission = metadata.checker(can);

    if (!hasPermission) {
      const role = this.sessionContext.getRole();
      throw new PermissionDeniedException('permission check', role);
    }

    return true;
  }
}
