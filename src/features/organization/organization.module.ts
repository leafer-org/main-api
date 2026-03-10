import { Module } from '@nestjs/common';

import { OrganizationDatabaseClient } from './adapters/db/client.js';
import { DrizzleOrganizationPermissionCheckService } from './adapters/db/organization-permission-check.service.js';
import { DrizzleItemQuery } from './adapters/db/queries/item.query.js';
import { DrizzleOrganizationQuery } from './adapters/db/queries/organization.query.js';
import { DrizzleItemRepository } from './adapters/db/repositories/item.repository.js';
import { DrizzleOrganizationRepository } from './adapters/db/repositories/organization.repository.js';
import { ItemsController } from './adapters/http/items.controller.js';
import { OrganizationEmployeesController } from './adapters/http/organization-employees.controller.js';
import { OrganizationRolesController } from './adapters/http/organization-roles.controller.js';
import { OrganizationsController } from './adapters/http/organizations.controller.js';
import { ModerationResultsKafkaHandler } from './adapters/kafka/handlers/moderation-results.handler.js';
import { OutboxItemEventPublisher } from './adapters/kafka/publishers/item-event.publisher.js';
import { OutboxOrganizationEventPublisher } from './adapters/kafka/publishers/organization-event.publisher.js';
import {
  ItemEventPublisher,
  ItemQueryPort,
  OrganizationEventPublisher,
  OrganizationQueryPort,
  OrganizationRepository,
  ItemRepository,
} from './application/ports.js';
import { OrganizationPermissionCheckService } from './application/organization-permission.js';
import { ChangeEmployeeRoleInteractor } from './application/use-cases/manage-employees/change-employee-role.interactor.js';
import { GetOrganizationEmployeesInteractor } from './application/use-cases/manage-employees/get-organization-employees.interactor.js';
import { InviteEmployeeInteractor } from './application/use-cases/manage-employees/invite-employee.interactor.js';
import { RemoveEmployeeInteractor } from './application/use-cases/manage-employees/remove-employee.interactor.js';
import { TransferOwnershipInteractor } from './application/use-cases/manage-employees/transfer-ownership.interactor.js';
import { ApproveItemModerationHandler } from './application/use-cases/manage-items/approve-item-moderation.handler.js';
import { CreateItemInteractor } from './application/use-cases/manage-items/create-item.interactor.js';
import { DeleteItemDraftInteractor } from './application/use-cases/manage-items/delete-item-draft.interactor.js';
import { GetItemDetailInteractor } from './application/use-cases/manage-items/get-item-detail.interactor.js';
import { GetOrganizationItemsInteractor } from './application/use-cases/manage-items/get-organization-items.interactor.js';
import { RejectItemModerationHandler } from './application/use-cases/manage-items/reject-item-moderation.handler.js';
import { RepublishItemsOnOrgUpdateHandler } from './application/use-cases/manage-items/republish-items-on-org-update.handler.js';
import { SubmitItemForModerationInteractor } from './application/use-cases/manage-items/submit-item-for-moderation.interactor.js';
import { UnpublishExcessItemsHandler } from './application/use-cases/manage-items/unpublish-excess-items.handler.js';
import { UnpublishItemInteractor } from './application/use-cases/manage-items/unpublish-item.interactor.js';
import { UpdateItemDraftInteractor } from './application/use-cases/manage-items/update-item-draft.interactor.js';
import { ApproveInfoModerationHandler } from './application/use-cases/manage-org/approve-info-moderation.handler.js';
import { CreateOrganizationInteractor } from './application/use-cases/manage-org/create-organization.interactor.js';
import { GetOrganizationDetailInteractor } from './application/use-cases/manage-org/get-organization-detail.interactor.js';
import { RejectInfoModerationHandler } from './application/use-cases/manage-org/reject-info-moderation.handler.js';
import { SubmitInfoForModerationInteractor } from './application/use-cases/manage-org/submit-info-for-moderation.interactor.js';
import { UpdateInfoDraftInteractor } from './application/use-cases/manage-org/update-info-draft.interactor.js';
import { CreateEmployeeRoleInteractor } from './application/use-cases/manage-roles/create-employee-role.interactor.js';
import { DeleteEmployeeRoleInteractor } from './application/use-cases/manage-roles/delete-employee-role.interactor.js';
import { GetOrganizationRolesInteractor } from './application/use-cases/manage-roles/get-organization-roles.interactor.js';
import { UpdateEmployeeRoleInteractor } from './application/use-cases/manage-roles/update-employee-role.interactor.js';
import { Clock, SystemClock } from '@/infra/lib/clock.js';

@Module({
  controllers: [
    OrganizationsController,
    OrganizationEmployeesController,
    OrganizationRolesController,
    ItemsController,
  ],
  providers: [
    // Infrastructure
    { provide: Clock, useClass: SystemClock },

    // Port → Adapter bindings
    { provide: OrganizationRepository, useClass: DrizzleOrganizationRepository },
    { provide: ItemRepository, useClass: DrizzleItemRepository },
    { provide: OrganizationQueryPort, useClass: DrizzleOrganizationQuery },
    { provide: ItemQueryPort, useClass: DrizzleItemQuery },
    { provide: OrganizationEventPublisher, useClass: OutboxOrganizationEventPublisher },
    { provide: ItemEventPublisher, useClass: OutboxItemEventPublisher },
    { provide: OrganizationPermissionCheckService, useClass: DrizzleOrganizationPermissionCheckService },

    // Use cases — Organization
    CreateOrganizationInteractor,
    UpdateInfoDraftInteractor,
    SubmitInfoForModerationInteractor,
    GetOrganizationDetailInteractor,

    // Use cases — Employees
    InviteEmployeeInteractor,
    RemoveEmployeeInteractor,
    ChangeEmployeeRoleInteractor,
    TransferOwnershipInteractor,
    GetOrganizationEmployeesInteractor,

    // Use cases — Roles
    CreateEmployeeRoleInteractor,
    UpdateEmployeeRoleInteractor,
    DeleteEmployeeRoleInteractor,
    GetOrganizationRolesInteractor,

    // Use cases — Items
    CreateItemInteractor,
    UpdateItemDraftInteractor,
    DeleteItemDraftInteractor,
    SubmitItemForModerationInteractor,
    UnpublishItemInteractor,
    GetOrganizationItemsInteractor,
    GetItemDetailInteractor,

    // Event handlers
    ApproveInfoModerationHandler,
    RejectInfoModerationHandler,
    ApproveItemModerationHandler,
    RejectItemModerationHandler,
    UnpublishExcessItemsHandler,
    RepublishItemsOnOrgUpdateHandler,

    // Kafka handler
    ModerationResultsKafkaHandler,
  ],
})
export class OrganizationModule {}
