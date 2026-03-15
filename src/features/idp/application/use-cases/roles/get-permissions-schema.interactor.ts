import { Inject, Injectable } from '@nestjs/common';

import { isLeft, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { Permissions } from '@/kernel/domain/permissions.js';

export type PermissionSchemaItem = {
  action: string;
  key: string;
  type: 'boolean' | 'enum';
  values?: string[];
  default: unknown;
  description: string;
};

const descriptions: Record<string, string> = {
  manageSession:
    'Управление сессиями. «self» — только свои, «all» — просмотр и завершение сессий любого пользователя',
  manageRole: 'Создание, редактирование и удаление ролей, назначение ролей пользователям',
  manageUser: 'Просмотр и поиск пользователей в админ-панели',
  manageCms:
    'Управление контентом: категории, типы услуг, атрибуты, публикация и снятие с публикации',
  moderateReview: 'Модерация отзывов пользователей',
  moderateOrganization:
    'Модерация организаций и их услуг: одобрение и отклонение заявок на публикацию',
  manageTicketBoard:
    'Управление досками тикетов: создание, настройка, участники, автоматизации и подписки',
  manageTicket:
    'Работа с тикетами: создание, назначение, смена статуса, перемещение между досками, комментарии',
  reassignTicket: 'Переназначение тикетов между исполнителями',
};

export function buildPermissionsSchema(): PermissionSchemaItem[] {
  return Object.entries(Permissions).map(([key, perm]) => ({
    action: perm.action,
    key,
    type: perm.context.type as 'boolean' | 'enum',
    values:
      perm.context.type === 'enum' ? (perm.context as { values: string[] }).values : undefined,
    default: perm.def,
    description: descriptions[key] ?? '',
  }));
}

@Injectable()
export class GetPermissionsSchemaInteractor {
  public constructor(
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute() {
    const auth = await this.permissionCheck.mustCan(Permissions.manageRole);
    if (isLeft(auth)) return auth;

    return Right(buildPermissionsSchema());
  }
}
