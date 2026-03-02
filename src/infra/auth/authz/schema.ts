import Type from 'typebox';

import type { PermissionAction } from './permissions-store.js';

export type PermissionContext =
  | {
      type: 'boolean';
    }
  | {
      type: 'enum';
      values: string[];
    }
  | {
      type: 'schema';
    };

export type PermissionVariant = {
  action: PermissionAction;
  schema: Type.TSchema;
  def: unknown;
  context: PermissionContext;
};

export type InferPermissionValue<T extends PermissionVariant> = Type.Static<T['schema']>;

export function BooleanPerm(action: string, def = false) {
  return {
    action,
    schema: Type.Boolean(),
    def,
    context: {
      type: 'boolean',
    },
  } satisfies PermissionVariant;
}

export function SchemaPerm<T extends Type.TSchema>(action: string, schema: T, def: Type.Static<T>) {
  return {
    action,
    schema,
    def,
    context: {
      type: 'schema',
    },
  } satisfies PermissionVariant;
}

export function EnumPerm<const T extends string>(action: string, values: T[], def: NoInfer<T>) {
  return {
    action,
    schema: Type.Enum(values),
    def,
    context: {
      type: 'enum',
      values,
    },
  } satisfies PermissionVariant;
}
