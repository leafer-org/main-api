export const Permission = {
  // session
  SessionReadAll: 'session.read.all',
  SessionDeleteAll: 'session.delete.all',

  // role
  RoleRead: 'role.read',
  RoleCreate: 'role.create',
  RoleUpdate: 'role.update',
  RoleDelete: 'role.delete',

  // user
  UserRead: 'user.read',
  UserBlock: 'user.block',
  UserUnblock: 'user.unblock',
  UserRoleAssign: 'user.role.assign',

  // cms.category
  CmsCategoryRead: 'cms.category.read',
  CmsCategoryCreate: 'cms.category.create',
  CmsCategoryUpdate: 'cms.category.update',
  CmsCategoryPublish: 'cms.category.publish',
  CmsCategoryUnpublish: 'cms.category.unpublish',
  CmsCategoryAttributeAdd: 'cms.category.attribute.add',
  CmsCategoryAttributeRemove: 'cms.category.attribute.remove',

  // cms.itemType
  CmsItemTypeRead: 'cms.itemType.read',
  CmsItemTypeCreate: 'cms.itemType.create',
  CmsItemTypeUpdate: 'cms.itemType.update',

  // review
  ReviewModerate: 'review.moderate',

  // organization
  OrganizationRead: 'organization.read',
  OrganizationCreate: 'organization.create',
  OrganizationDelete: 'organization.delete',
  OrganizationClaimTokenRegenerate: 'organization.claimToken.regenerate',
  OrganizationInfoModerate: 'organization.info.moderate',
  OrganizationItemModerate: 'organization.item.moderate',
  OrganizationItemEdit: 'organization.item.edit',

  // ticket.board
  TicketBoardRead: 'ticket.board.read',
  TicketBoardCreate: 'ticket.board.create',
  TicketBoardUpdate: 'ticket.board.update',
  TicketBoardDelete: 'ticket.board.delete',
  TicketBoardMemberAdd: 'ticket.board.member.add',
  TicketBoardMemberRemove: 'ticket.board.member.remove',
  TicketBoardAutomationAdd: 'ticket.board.automation.add',
  TicketBoardAutomationRemove: 'ticket.board.automation.remove',
  TicketBoardSubscriptionAdd: 'ticket.board.subscription.add',
  TicketBoardSubscriptionRemove: 'ticket.board.subscription.remove',

  // ticket
  TicketRead: 'ticket.read',
  TicketCreate: 'ticket.create',
  TicketMove: 'ticket.move',
  TicketAssign: 'ticket.assign',
  TicketReassign: 'ticket.reassign',
  TicketUnassign: 'ticket.unassign',
  TicketMarkDone: 'ticket.markDone',
  TicketReopen: 'ticket.reopen',
  TicketCommentAdd: 'ticket.comment.add',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

export type PermissionMeta = {
  id: Permission;
  title: string;
  description: string;
};

export const PERMISSION_META: Record<Permission, PermissionMeta> = {
  [Permission.SessionReadAll]: {
    id: Permission.SessionReadAll,
    title: 'Просмотр сессий пользователей',
    description: 'Просмотр активных сессий любого пользователя',
  },
  [Permission.SessionDeleteAll]: {
    id: Permission.SessionDeleteAll,
    title: 'Завершение чужих сессий',
    description: 'Принудительное завершение сессий любого пользователя',
  },

  [Permission.RoleRead]: {
    id: Permission.RoleRead,
    title: 'Просмотр ролей',
    description: 'Просмотр списка ролей и каталога пермишенов',
  },
  [Permission.RoleCreate]: {
    id: Permission.RoleCreate,
    title: 'Создание ролей',
    description: 'Создание новых ролей',
  },
  [Permission.RoleUpdate]: {
    id: Permission.RoleUpdate,
    title: 'Редактирование ролей',
    description: 'Изменение пермишенов существующих ролей',
  },
  [Permission.RoleDelete]: {
    id: Permission.RoleDelete,
    title: 'Удаление ролей',
    description: 'Удаление ролей с переназначением пользователей на другую роль',
  },

  [Permission.UserRead]: {
    id: Permission.UserRead,
    title: 'Просмотр пользователей',
    description: 'Поиск и просмотр пользователей в админке',
  },
  [Permission.UserBlock]: {
    id: Permission.UserBlock,
    title: 'Блокировка пользователей',
    description: 'Блокировка учётных записей пользователей',
  },
  [Permission.UserUnblock]: {
    id: Permission.UserUnblock,
    title: 'Разблокировка пользователей',
    description: 'Снятие блокировки с учётных записей пользователей',
  },
  [Permission.UserRoleAssign]: {
    id: Permission.UserRoleAssign,
    title: 'Назначение ролей',
    description: 'Назначение роли пользователю',
  },

  [Permission.CmsCategoryRead]: {
    id: Permission.CmsCategoryRead,
    title: 'Просмотр категорий',
    description: 'Просмотр категорий каталога и их атрибутов',
  },
  [Permission.CmsCategoryCreate]: {
    id: Permission.CmsCategoryCreate,
    title: 'Создание категорий',
    description: 'Создание новых категорий каталога',
  },
  [Permission.CmsCategoryUpdate]: {
    id: Permission.CmsCategoryUpdate,
    title: 'Редактирование категорий',
    description: 'Изменение свойств категорий',
  },
  [Permission.CmsCategoryPublish]: {
    id: Permission.CmsCategoryPublish,
    title: 'Публикация категорий',
    description: 'Публикация категорий в каталоге',
  },
  [Permission.CmsCategoryUnpublish]: {
    id: Permission.CmsCategoryUnpublish,
    title: 'Снятие публикации категорий',
    description: 'Снятие категорий с публикации',
  },
  [Permission.CmsCategoryAttributeAdd]: {
    id: Permission.CmsCategoryAttributeAdd,
    title: 'Добавление атрибутов категории',
    description: 'Добавление новых атрибутов в категорию',
  },
  [Permission.CmsCategoryAttributeRemove]: {
    id: Permission.CmsCategoryAttributeRemove,
    title: 'Удаление атрибутов категории',
    description: 'Удаление атрибутов из категории',
  },

  [Permission.CmsItemTypeRead]: {
    id: Permission.CmsItemTypeRead,
    title: 'Просмотр типов услуг',
    description: 'Просмотр списка типов услуг',
  },
  [Permission.CmsItemTypeCreate]: {
    id: Permission.CmsItemTypeCreate,
    title: 'Создание типов услуг',
    description: 'Создание новых типов услуг',
  },
  [Permission.CmsItemTypeUpdate]: {
    id: Permission.CmsItemTypeUpdate,
    title: 'Редактирование типов услуг',
    description: 'Изменение существующих типов услуг',
  },

  [Permission.ReviewModerate]: {
    id: Permission.ReviewModerate,
    title: 'Модерация отзывов',
    description: 'Одобрение и отклонение отзывов пользователей',
  },

  [Permission.OrganizationRead]: {
    id: Permission.OrganizationRead,
    title: 'Просмотр организаций',
    description: 'Поиск и просмотр организаций в админке',
  },
  [Permission.OrganizationCreate]: {
    id: Permission.OrganizationCreate,
    title: 'Создание организаций',
    description: 'Админ-создание организаций (без процедуры claim)',
  },
  [Permission.OrganizationDelete]: {
    id: Permission.OrganizationDelete,
    title: 'Удаление организаций',
    description: 'Удаление организации администратором, минуя локальные роли',
  },
  [Permission.OrganizationClaimTokenRegenerate]: {
    id: Permission.OrganizationClaimTokenRegenerate,
    title: 'Перевыпуск claim-токена',
    description: 'Перевыпуск токена для привязки организации владельцем',
  },
  [Permission.OrganizationInfoModerate]: {
    id: Permission.OrganizationInfoModerate,
    title: 'Модерация описания организации',
    description: 'Одобрение и отклонение черновика описания организации',
  },
  [Permission.OrganizationItemModerate]: {
    id: Permission.OrganizationItemModerate,
    title: 'Модерация услуг',
    description: 'Одобрение и отклонение черновиков услуг организаций',
  },
  [Permission.OrganizationItemEdit]: {
    id: Permission.OrganizationItemEdit,
    title: 'Редактирование услуг (admin)',
    description: 'Создание и редактирование услуг любой организации, минуя локальные роли',
  },

  [Permission.TicketBoardRead]: {
    id: Permission.TicketBoardRead,
    title: 'Просмотр досок тикетов',
    description: 'Просмотр досок, фильтров, триггеров',
  },
  [Permission.TicketBoardCreate]: {
    id: Permission.TicketBoardCreate,
    title: 'Создание досок',
    description: 'Создание новых досок тикетов',
  },
  [Permission.TicketBoardUpdate]: {
    id: Permission.TicketBoardUpdate,
    title: 'Редактирование досок',
    description: 'Изменение настроек досок',
  },
  [Permission.TicketBoardDelete]: {
    id: Permission.TicketBoardDelete,
    title: 'Удаление досок',
    description: 'Удаление досок тикетов',
  },
  [Permission.TicketBoardMemberAdd]: {
    id: Permission.TicketBoardMemberAdd,
    title: 'Добавление участников доски',
    description: 'Назначение пользователей участниками доски',
  },
  [Permission.TicketBoardMemberRemove]: {
    id: Permission.TicketBoardMemberRemove,
    title: 'Удаление участников доски',
    description: 'Снятие пользователей с участия в доске',
  },
  [Permission.TicketBoardAutomationAdd]: {
    id: Permission.TicketBoardAutomationAdd,
    title: 'Добавление автоматизаций',
    description: 'Создание автоматизаций на доске',
  },
  [Permission.TicketBoardAutomationRemove]: {
    id: Permission.TicketBoardAutomationRemove,
    title: 'Удаление автоматизаций',
    description: 'Удаление автоматизаций с доски',
  },
  [Permission.TicketBoardSubscriptionAdd]: {
    id: Permission.TicketBoardSubscriptionAdd,
    title: 'Добавление подписок',
    description: 'Создание подписок на события доски (создание/закрытие/перенаправление)',
  },
  [Permission.TicketBoardSubscriptionRemove]: {
    id: Permission.TicketBoardSubscriptionRemove,
    title: 'Удаление подписок',
    description: 'Удаление подписок с доски',
  },

  [Permission.TicketRead]: {
    id: Permission.TicketRead,
    title: 'Просмотр тикетов',
    description: 'Просмотр тикетов и их деталей',
  },
  [Permission.TicketCreate]: {
    id: Permission.TicketCreate,
    title: 'Создание тикетов',
    description: 'Создание новых тикетов',
  },
  [Permission.TicketMove]: {
    id: Permission.TicketMove,
    title: 'Перемещение тикетов',
    description: 'Перенос тикетов между досками',
  },
  [Permission.TicketAssign]: {
    id: Permission.TicketAssign,
    title: 'Назначение тикетов',
    description: 'Первичное назначение тикета на исполнителя',
  },
  [Permission.TicketReassign]: {
    id: Permission.TicketReassign,
    title: 'Переназначение тикетов',
    description: 'Смена исполнителя у уже назначенного тикета',
  },
  [Permission.TicketUnassign]: {
    id: Permission.TicketUnassign,
    title: 'Снятие назначения',
    description: 'Снятие назначения тикета с исполнителя (включая массовое)',
  },
  [Permission.TicketMarkDone]: {
    id: Permission.TicketMarkDone,
    title: 'Закрытие тикетов',
    description: 'Перевод тикета в статус «выполнено»',
  },
  [Permission.TicketReopen]: {
    id: Permission.TicketReopen,
    title: 'Переоткрытие тикетов',
    description: 'Возврат закрытого тикета в работу',
  },
  [Permission.TicketCommentAdd]: {
    id: Permission.TicketCommentAdd,
    title: 'Комментирование тикетов',
    description: 'Добавление комментариев к тикетам',
  },
};
