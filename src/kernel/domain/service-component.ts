import type { AgeGroup } from './vo.js';
import type {
  AttributeId,
  CategoryId,
  FileId,
  OrganizationId,
  ServiceComponentId,
} from './ids.js';

export type BaseInfoComponent = {
  type: 'base-info';
  id: ServiceComponentId;
  title: string;
  description: string;
  photoId: FileId;
};

export type AgeGroupComponent = {
  type: 'age-group';
  id: ServiceComponentId;
  value: AgeGroup;
};

export type CategoryComponent = {
  type: 'category';
  id: ServiceComponentId;
  categoryId: CategoryId;
  attributes: Array<{
    attributeId: AttributeId;
    value: string;
  }>;
};

export type OrganizationComponent = {
  type: 'organization';
  id: ServiceComponentId;
  organizationId: OrganizationId;
};

export type LocationComponent = {
  type: 'location';
  id: ServiceComponentId;
  cityId: string;
  lat: number;
  lng: number;
  address: string;
};

export type ServiceComponent =
  | BaseInfoComponent
  | AgeGroupComponent
  | CategoryComponent
  | OrganizationComponent
  | LocationComponent;
