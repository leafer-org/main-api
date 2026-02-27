import type { ValueObject } from '@/infra/ddd/value-object.js';

/**
 * FingerPrint — идентификатор устройства клиента.
 * Пока реализован только на основе IP-адреса.
 */
export type FingerPrint = ValueObject<string, 'FingerPrint'>;

export const FingerPrint = {
  fromIp: (ip: string): FingerPrint => ip as FingerPrint,

  equals: (fp1: FingerPrint, fp2: FingerPrint): boolean => fp1 === fp2,

  /** Без валидации — для восстановления из БД */
  raw: (value: string): FingerPrint => value as FingerPrint,
};
