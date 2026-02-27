/**
 * Утилита для создания доменных событий.
 *
 * Пример использования:
 *
 * ```typescript
 * import { CreateEvent, createEventId } from "@/infra/ddd/event";
 *
 * // Пример 1: событие без данных
 *
 * const UserCreatedEvent = CreateEvent("user.created");
 * export type UserCreatedEvent = typeof UserCreatedEvent.Type;
 *
 * const userCreated = UserCreatedEvent.build({
 *   id: createEventId(),
 *   now: new Date(),
 * });
 *
 * // Пример 2: событие с данными (withPayload)
 *
 * const UserRenamedEvent = CreateEvent("user.renamed").withPayload<{ name: string }>();
 * export type UserRenamedEvent = typeof UserRenamedEvent.Type;
 *
 * const userRenamed = UserRenamedEvent.build({
 *   id: createEventId(),
 *   now: new Date(),
 *   data: { name: "John Doe" },
 * });
 * ```
 */
export type EventId = string & {
  __barand: 'EventId';
};

export type DomainEvent<Name extends string = string, Data = unknown> = {
  id: EventId;
  name: Name;
  occuredAt: string;
  data: Data;
};

export type EventBuilder<Name extends string, Data> = {
  build({
    id,
    now,
  }: Data extends undefined
    ? { id: EventId; now: Date }
    : { id: EventId; now: Date; data: Data }): DomainEvent<Name, Data>;
  Type: DomainEvent<Name, Data>;
  withPayload<NewData>(): EventBuilder<Name, NewData>;
};

export function CreateEvent<Name extends string>(name: Name): EventBuilder<Name, undefined> {
  const builder = {
    build({ id, now, data }: { id: EventId; now: Date; data?: unknown }) {
      return {
        id,
        name,
        occuredAt: now.toISOString(),
        data,
      };
    },
    withPayload() {
      return builder;
    },
  };

  return builder as EventBuilder<Name, undefined>;
}

export function createEventId() {
  return crypto.randomUUID() as EventId;
}
