import type {
  CategoryId,
  ItemId,
  MediaId,
  OrganizationId,
  TypeId,
} from '@/kernel/domain/ids.js';

export type TicketItemData = {
  id: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  title: string;
  description: string;
  imageId: MediaId | null;
  categoryIds: CategoryId[];
};

export type TicketOrganizationData = {
  id: OrganizationId;
  name: string;
  description: string;
  avatarId: MediaId | null;
};

export type TicketData = {
  item?: TicketItemData;
  organization?: TicketOrganizationData;
};
