/**
 * Базовый класс для всех сущностей в проекте
 *
 * Важно - мы соединяем функциональный подход и ООП
 * - от ООП - инкапсуляция и сокрытие
 * - от функционального - иммутабельность
 *
 * Пример использования:
 * ```typescript
 * type UserId = UUID<"User">; // Брендированный Id
 * type UserData = {
 *   id: UserId; // Id обязателен
 *   phone: PhoneNumber;
 *   createdAt: Date;
 * };
 * class User extends Entity<UserData> {
 *   create(id: UserId, phone: PhoneNumber, now: Date) {
 *     // Нет сайд эффектов. принимаем id и now из вне
 *     return new User({ id, phone, createdAt: new Date() });
 *   }
 *
 *   // Геттеры для доступа к данным. Только необходимые для логики. Для тестов используем toJson()
 *   get id(): UserId {
 *     return this.data.id;
 *   }
 *
 *   setPhone(phone: PhoneNumber): Either<PhoneAlreadySetError, User> {
 *     if(this.data.phone === phone) {
 *       // Не выбрасываем ошибки а используем Either
 *       return Left(new PhoneAlreadySetError(this.data.id, phone));
 *     }
 *
 *     // Изменения иммутабельные
 *     return Right(new User({ ...this.data, phone }));
 *   }
 *
 *   // Собатия пораждаемые сущностью возвращаются из метода в месте с сущностью
 *   delete(eventBuilder: DomainEventBuilder): [User, UserDeletedEvent] {
 *     const userDeletedEvent = eventBuilder.bindEntity(this).buildEvent(UserDeletedEvent);
 *     return [this, userDeletedEvent];
 *   }
 *
 *
 *   // что бы каждый раз не передавать eventBuilder можно передать в конструктор
 *   private eventBuilder: BindEntity<DomainEventBuilder, typeof UserEntity>;
 *   constructor(data: UserData, eventBuilder: DomainEventBuilder){
 *     super(data);
 *     this.eventBuilder = eventBuilder.bindEntity(this);
 *   }
 *
 *   delete(): [User, UserDeletedEvent] {
 *     const userDeletedEvent = this.eventBuilder.buildEvent(UserDeletedEvent);
 *     return [this, userDeletedEvent];
 *   }
 * }
 *
 *
 *   // сериализация десериализация
 *   const userJson = user.toJson();
 *   const user = new User(userJson)
 *
 *   так же это используем для тестов!
 *
 *
 * ```
 */
export abstract class Entity<T extends { id: EntityId<string> } = { id: EntityId<string> }> {
  public constructor(protected readonly state: Readonly<T>) {}

  public get id(): T['id'] {
    return this.state.id;
  }

  public toJson(): Readonly<T> {
    return this.state;
  }

  public static equals(a: Entity, b: Entity): boolean {
    return a.toJson().id === b.toJson().id;
  }
}

export type EntityId<B> = string & { __entityIdBrand: B };

export type EntityClass<T extends Entity = Entity> = new (...args: never[]) => T;
export type InferEntityId<T extends EntityClass> = InstanceType<T>['id'];
