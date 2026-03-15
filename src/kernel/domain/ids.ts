import type { EntityId } from '@/infra/ddd/entity.js';

function createEntityId<T extends EntityId<string>>() {
  return {
    raw(id: string): T {
      return id as T;
    },
  };
}

export type MediaId = EntityId<'Media'>;
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
export type TicketId = EntityId<'Ticket'>;
export type BoardId = EntityId<'Board'>;
export type BoardSubscriptionId = EntityId<'BoardSubscription'>;
export type BoardAutomationId = EntityId<'BoardAutomation'>;
export type ReviewId = EntityId<'Review'>;

export const MediaId = createEntityId<MediaId>();
export const UserId = createEntityId<UserId>();
export const SessionId = createEntityId<SessionId>();
export const RoleId = createEntityId<RoleId>();
export const ServiceId = createEntityId<ServiceId>();
export const ItemId = createEntityId<ItemId>();
export const CategoryId = createEntityId<CategoryId>();
export const ServiceComponentId = createEntityId<ServiceComponentId>();
export const AttributeId = createEntityId<AttributeId>();
export const OrganizationId = createEntityId<OrganizationId>();
export const TypeId = createEntityId<TypeId>();
export const EmployeeRoleId = createEntityId<EmployeeRoleId>();
export const TicketId = createEntityId<TicketId>();
export const BoardId = createEntityId<BoardId>();
export const BoardSubscriptionId = createEntityId<BoardSubscriptionId>();
export const BoardAutomationId = createEntityId<BoardAutomationId>();
export const ReviewId = createEntityId<ReviewId>();
