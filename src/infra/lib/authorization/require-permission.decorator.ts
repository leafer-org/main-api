import { SetMetadata } from '@nestjs/common';

import type { PermissionService } from './permission-service.js';

export const PERMISSION_METADATA_KEY = Symbol('PERMISSION_METADATA_KEY');

export type PermissionChecker = (can: PermissionService['can']) => boolean;

export type PermissionMetadata = {
  checker: PermissionChecker;
};

export function RequirePermission(checker: PermissionChecker): MethodDecorator & ClassDecorator {
  const metadata: PermissionMetadata = { checker };
  return SetMetadata(PERMISSION_METADATA_KEY, metadata);
}
