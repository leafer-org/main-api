import type { ItemId } from '@/kernel/domain/ids.js';

/**
 * Прикрепляемые к сообщению карточки публичных данных. Иммутабельны после
 * создания сообщения (edit меняет только text/mediaIds). Backend не валидирует
 * содержимое — клиент прикладывает любые публичные ссылки.
 *
 * Расширение: новый context = новый вариант union. Никаких новых полей на
 * самом чате.
 */
export type MessageAttachment = { kind: 'item-ref'; itemId: ItemId };

export type MessageAttachmentKind = MessageAttachment['kind'];
