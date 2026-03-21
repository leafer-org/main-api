import { CreateDomainError } from '@/infra/ddd/error.js';

export class ItemTypeAlreadyExistsError extends CreateDomainError(
  'item_type_already_exists',
  400,
) {}

export class ItemTypeNotFoundError extends CreateDomainError('item_type_not_found', 404) {}

export class DuplicateWidgetSettingsError extends CreateDomainError(
  'duplicate_widget_settings',
  400,
).withData<{ duplicateTypes: string[] }>() {}
