import type {
  AttributeId,
  CategoryId,
  FileId,
  OwnerId,
  ServiceId,
  TypeId,
} from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

export type ScheduleEntry = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type ItemBaseInfo = {
  title: string;
  description: string;
  imageId: FileId | null;
};

export type ItemLocation = {
  cityId: string;
  coordinates: { lat: number; lng: number };
  address: string | null;
};

export type ItemPayment = {
  strategy: 'free' | 'one-time' | 'subscription';
  price: number | null;
};

export type ItemCategory = {
  categoryIds: CategoryId[];
  attributeValues: { attributeId: AttributeId; value: string }[];
};

export type ItemOwner = {
  ownerId: OwnerId;
  type: 'organization' | 'user';
  name: string;
  avatarId: FileId | null;
};

export type ItemReview = {
  rating: number | null;
  reviewCount: number;
};

export type ItemReadModel = {
  itemId: ServiceId;
  typeId: TypeId;

  baseInfo?: ItemBaseInfo;
  ageGroup?: AgeGroup;
  location?: ItemLocation;
  payment?: ItemPayment;
  category?: ItemCategory;
  owner?: ItemOwner;
  itemReview?: ItemReview;
  ownerReview?: ItemReview;
  eventDateTime?: { dates: Date[] };
  schedule?: { entries: ScheduleEntry[] };

  publishedAt: Date;
  updatedAt: Date;
};
