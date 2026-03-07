import type { OrganizationPublishedEvent } from '@/kernel/domain/events/organization.events.js';
import type { UserCreatedEvent, UserUpdatedEvent } from '@/kernel/domain/events/user.events.js';
import { type FileId, OrganizationId } from '@/kernel/domain/ids.js';

export type OwnerReadModel = {
  ownerId: OrganizationId;
  ownerType: 'organization' | 'user';
  name: string;
  avatarId: FileId | null;
  rating: number | null;
  reviewCount: number;
  updatedAt: Date;
};

export function projectOwnerFromOrganization(event: OrganizationPublishedEvent): OwnerReadModel {
  return {
    ownerId: OrganizationId.raw(event.organizationId),
    ownerType: 'organization',
    name: event.name,
    avatarId: event.avatarId,
    rating: null,
    reviewCount: 0,
    updatedAt: event.publishedAt,
  };
}

export function projectOwnerFromUser(event: UserCreatedEvent | UserUpdatedEvent): OwnerReadModel {
  return {
    ownerId: OrganizationId.raw(event.userId),
    ownerType: 'user',
    name: event.name,
    avatarId: event.avatarId,
    rating: null,
    reviewCount: 0,
    updatedAt: event.type === 'user.created' ? event.createdAt : event.updatedAt,
  };
}
