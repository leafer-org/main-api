import { Permission } from './permissions.js';

export type PermissionGroup = {
  id: string;
  title: string;
  permissions: readonly Permission[];
};

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    id: 'session',
    title: 'Сессии',
    permissions: [Permission.SessionReadAll, Permission.SessionDeleteAll],
  },
  {
    id: 'role',
    title: 'Роли',
    permissions: [
      Permission.RoleRead,
      Permission.RoleCreate,
      Permission.RoleUpdate,
      Permission.RoleDelete,
    ],
  },
  {
    id: 'user',
    title: 'Пользователи',
    permissions: [
      Permission.UserRead,
      Permission.UserBlock,
      Permission.UserUnblock,
      Permission.UserRoleAssign,
    ],
  },
  {
    id: 'cms_category',
    title: 'Категории каталога',
    permissions: [
      Permission.CmsCategoryRead,
      Permission.CmsCategoryCreate,
      Permission.CmsCategoryUpdate,
      Permission.CmsCategoryPublish,
      Permission.CmsCategoryUnpublish,
      Permission.CmsCategoryAttributeAdd,
      Permission.CmsCategoryAttributeRemove,
    ],
  },
  {
    id: 'cms_item_type',
    title: 'Типы услуг',
    permissions: [
      Permission.CmsItemTypeRead,
      Permission.CmsItemTypeCreate,
      Permission.CmsItemTypeUpdate,
    ],
  },
  {
    id: 'review',
    title: 'Отзывы',
    permissions: [Permission.ReviewModerate],
  },
  {
    id: 'organization',
    title: 'Организации',
    permissions: [
      Permission.OrganizationRead,
      Permission.OrganizationCreate,
      Permission.OrganizationDelete,
      Permission.OrganizationClaimTokenRegenerate,
      Permission.OrganizationInfoModerate,
      Permission.OrganizationItemModerate,
      Permission.OrganizationInfoEdit,
      Permission.OrganizationInfoPublish,
      Permission.OrganizationItemEdit,
      Permission.OrganizationItemPublish,
      Permission.OrganizationItemUnpublish,
    ],
  },
  {
    id: 'ticket_board',
    title: 'Доски тикетов',
    permissions: [
      Permission.TicketBoardRead,
      Permission.TicketBoardCreate,
      Permission.TicketBoardUpdate,
      Permission.TicketBoardDelete,
      Permission.TicketBoardMemberAdd,
      Permission.TicketBoardMemberRemove,
      Permission.TicketBoardAutomationAdd,
      Permission.TicketBoardAutomationRemove,
      Permission.TicketBoardSubscriptionAdd,
      Permission.TicketBoardSubscriptionRemove,
    ],
  },
  {
    id: 'ticket',
    title: 'Тикеты',
    permissions: [
      Permission.TicketRead,
      Permission.TicketCreate,
      Permission.TicketMove,
      Permission.TicketAssign,
      Permission.TicketReassign,
      Permission.TicketUnassign,
      Permission.TicketMarkDone,
      Permission.TicketReopen,
      Permission.TicketCommentAdd,
    ],
  },
];
