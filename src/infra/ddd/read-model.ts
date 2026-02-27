/**
 * ReadModel - проекция данных для чтения.
 *
 * В отличие от Entity и ValueObject:
 * - Не содержит бизнес-логики
 * - Не требует валидации
 * - Оптимизирован под конкретный use case
 *
 * Соглашение:
 * - Тип называется XxxReadModel
 * - Функция проекции называется xxxToReadModel или xxxReadModel
 *
 * @example
 *
 * // domain/read-models/user.ts
 *
 * export type UserReadModel = {
 *   readonly id: string;
 *   readonly phoneNumber: string;
 * };
 *
 * // Проекция из Entity
 * export function userToReadModel(user: UserEntity): UserReadModel {
 *   const data = user.toJson();
 *   return { id: data.id, phoneNumber: data.phoneNumber };
 * }
 *
 * // Или фабрика из raw data (для repository)
 * export function UserReadModel(raw): UserReadModel {
 *   return raw;
 * }
 *  */

// Хелпер только для документации / самодокументируемого кода
export type ReadModel<T> = Readonly<T>;
