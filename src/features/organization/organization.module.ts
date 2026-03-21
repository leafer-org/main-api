import { Module } from '@nestjs/common';

import { OrganizationDatabaseClient } from './adapters/db/client.js';
import { DrizzleOrganizationPermissionCheckService } from './adapters/db/organization-permission-check.service.js';
import { DrizzleClaimTokenQuery } from './adapters/db/queries/claim-token.query.js';
import { DrizzleItemQuery } from './adapters/db/queries/item.query.js';
import { DrizzleOrganizationQuery } from './adapters/db/queries/organization.query.js';
import { DrizzleItemRepository } from './adapters/db/repositories/item.repository.js';
import { DrizzleOrganizationRepository } from './adapters/db/repositories/organization.repository.js';
import { AdminOrganizationsController } from './adapters/http/admin-organizations.controller.js';
import { ItemsController } from './adapters/http/items.controller.js';
import { OrganizationEmployeesController } from './adapters/http/organization-employees.controller.js';
import { OrganizationRolesController } from './adapters/http/organization-roles.controller.js';
import { OrganizationsController } from './adapters/http/organizations.controller.js';
import { OutboxItemEventPublisher } from './adapters/kafka/publishers/item-event.publisher.js';
import { OutboxOrganizationEventPublisher } from './adapters/kafka/publishers/organization-event.publisher.js';
import { MeiliAdminOrganizationsListQuery } from './adapters/search/admin-organizations-list.query.js';
import { MeiliAdminOrganizationsListRepository } from './adapters/search/admin-organizations-list.repository.js';
import { AdminOrganizationsSyncService } from './adapters/search/admin-organizations-sync.service.js';
import { OrganizationPermissionCheckService } from './application/organization-permission.js';
import {
  AdminOrganizationsListQueryPort,
  AdminOrganizationsListRepository,
  ClaimTokenQueryPort,
  ItemEventPublisher,
  ItemQueryPort,
  ItemRepository,
  OrganizationEventPublisher,
  OrganizationQueryPort,
  OrganizationRepository,
} from './application/ports.js';
import { SearchAdminOrganizationsInteractor } from './application/use-cases/admin-organizations-list/search-admin-organizations.interactor.js';
import { ChangeEmployeeRoleInteractor } from './application/use-cases/manage-employees/change-employee-role.interactor.js';
import { GetOrganizationEmployeesInteractor } from './application/use-cases/manage-employees/get-organization-employees.interactor.js';
import { InviteEmployeeInteractor } from './application/use-cases/manage-employees/invite-employee.interactor.js';
import { RemoveEmployeeInteractor } from './application/use-cases/manage-employees/remove-employee.interactor.js';
import { TransferOwnershipInteractor } from './application/use-cases/manage-employees/transfer-ownership.interactor.js';
import { ApproveItemModerationInteractor } from './application/use-cases/moderation/approve-item-moderation.interactor.js';
import { CreateItemInteractor } from './application/use-cases/manage-items/create-item.interactor.js';
import { DeleteItemDraftInteractor } from './application/use-cases/manage-items/delete-item-draft.interactor.js';
import { GetItemDetailInteractor } from './application/use-cases/manage-items/get-item-detail.interactor.js';
import { GetOrganizationItemsInteractor } from './application/use-cases/manage-items/get-organization-items.interactor.js';
import { RejectItemModerationInteractor } from './application/use-cases/moderation/reject-item-moderation.interactor.js';
import { RepublishItemsOnOrgUpdateHandler } from './application/use-cases/manage-items/republish-items-on-org-update.handler.js';
import { SubmitItemForModerationInteractor } from './application/use-cases/moderation/submit-item-for-moderation.interactor.js';
import { UnpublishExcessItemsHandler } from './application/use-cases/manage-items/unpublish-excess-items.handler.js';
import { UnpublishItemInteractor } from './application/use-cases/manage-items/unpublish-item.interactor.js';
import { UpdateItemDraftInteractor } from './application/use-cases/manage-items/update-item-draft.interactor.js';
import { AdminCreateOrganizationInteractor } from './application/use-cases/create-and-claim-organization/admin-create-organization.interactor.js';
import { ApproveInfoModerationInteractor } from './application/use-cases/moderation/approve-info-moderation.interactor.js';
import { ClaimOrganizationInteractor } from './application/use-cases/create-and-claim-organization/claim-organization.interactor.js';
import { CreateOrganizationInteractor } from './application/use-cases/manage-org/create-organization.interactor.js';
import { DeleteOrganizationInteractor } from './application/use-cases/manage-org/delete-organization.interactor.js';
import { DiscardInfoDraftChangesInteractor } from './application/use-cases/manage-org/discard-info-draft-changes.interactor.js';
import { GetOrganizationDetailInteractor } from './application/use-cases/manage-org/get-organization-detail.interactor.js';
import { RegenerateClaimTokenInteractor } from './application/use-cases/create-and-claim-organization/regenerate-claim-token.interactor.js';
import { RejectInfoModerationInteractor } from './application/use-cases/moderation/reject-info-moderation.interactor.js';
import { SubmitInfoForModerationInteractor } from './application/use-cases/moderation/submit-info-for-moderation.interactor.js';
import { UnpublishOrganizationInteractor } from './application/use-cases/manage-org/unpublish-organization.interactor.js';
import { UpdateInfoDraftInteractor } from './application/use-cases/manage-org/update-info-draft.interactor.js';
import { CreateEmployeeRoleInteractor } from './application/use-cases/manage-roles/create-employee-role.interactor.js';
import { DeleteEmployeeRoleInteractor } from './application/use-cases/manage-roles/delete-employee-role.interactor.js';
import { GetOrganizationRolesInteractor } from './application/use-cases/manage-roles/get-organization-roles.interactor.js';
import { UpdateEmployeeRoleInteractor } from './application/use-cases/manage-roles/update-employee-role.interactor.js';
import { Clock, SystemClock } from '@/infra/lib/clock.js';

@Module({
  controllers: [
    OrganizationsController,
    AdminOrganizationsController,
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
    { provide: ClaimTokenQueryPort, useClass: DrizzleClaimTokenQuery },
    {
      provide: OrganizationPermissionCheckService,
      useClass: DrizzleOrganizationPermissionCheckService,
    },
    { provide: AdminOrganizationsListRepository, useClass: MeiliAdminOrganizationsListRepository },
    { provide: AdminOrganizationsListQueryPort, useClass: MeiliAdminOrganizationsListQuery },
    AdminOrganizationsSyncService,

    // Use cases — Organization
    SearchAdminOrganizationsInteractor,
    CreateOrganizationInteractor,
    AdminCreateOrganizationInteractor,
    ClaimOrganizationInteractor,
    DeleteOrganizationInteractor,
    RegenerateClaimTokenInteractor,
    UpdateInfoDraftInteractor,
    DiscardInfoDraftChangesInteractor,
    GetOrganizationDetailInteractor,
    UnpublishOrganizationInteractor,

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
    UnpublishItemInteractor,
    GetOrganizationItemsInteractor,
    GetItemDetailInteractor,

    // Use cases — Moderation
    SubmitInfoForModerationInteractor,
    ApproveInfoModerationInteractor,
    RejectInfoModerationInteractor,
    SubmitItemForModerationInteractor,
    ApproveItemModerationInteractor,
    RejectItemModerationInteractor,

    // Event handlers
    UnpublishExcessItemsHandler,
    RepublishItemsOnOrgUpdateHandler,
  ],
})
export class OrganizationModule {}
