import type { EntityId } from '@/infra/ddd/entity.js';

export type FileId = EntityId<'File'>;
export type UserId = EntityId<'User'>;
export type SessionId = EntityId<'Session'>;
export type RoleId = EntityId<'Role'>;
export type ServiceId = EntityId<'Service'>;
export type ItemId = EntityId<'Item'>;
export type CategoryId = EntityId<'Category'>;
export type ServiceComponentId = EntityId<'ServiceComponent'>;
export type AttributeId = EntityId<'Attribute'>;
export type OrganizationId = EntityId<'Organization'>;
export type TypeId = EntityId<'Type'>;
export type EmployeeRoleId = EntityId<'EmployeeRole'>;

export const FileId = {
  raw(id: string): FileId {
    return id as FileId;
  },
};

export const UserId = {
  raw(id: string): UserId {
    return id as UserId;
  },
};

export const SessionId = {
  raw(id: string): SessionId {
    return id as SessionId;
  },
};

export const RoleId = {
  raw(id: string): RoleId {
    return id as RoleId;
  },
};

export const ServiceId = {
  raw(id: string): ServiceId {
    return id as ServiceId;
  },
};

export const ItemId = {
  raw(id: string): ItemId {
    return id as ItemId;
  },
};

export const CategoryId = {
  raw(id: string): CategoryId {
    return id as CategoryId;
  },
};

export const ServiceComponentId = {
  raw(id: string): ServiceComponentId {
    return id as ServiceComponentId;
  },
};

export const AttributeId = {
  raw(id: string): AttributeId {
    return id as AttributeId;
  },
};

export const OrganizationId = {
  raw(id: string): OrganizationId {
    return id as OrganizationId;
  },
};

export const TypeId = {
  raw(id: string): TypeId {
    return id as TypeId;
  },
};

export const EmployeeRoleId = {
  raw(id: string): EmployeeRoleId {
    return id as EmployeeRoleId;
  },
};
