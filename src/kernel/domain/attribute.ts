export type TextAttributeSchema = { type: 'text' };
export type NumberAttributeSchema = { type: 'number'; min?: number; max?: number };
export type EnumAttributeSchema = { type: 'enum'; options: string[] };
export type BooleanAttributeSchema = { type: 'boolean' };

export type AttributeSchema =
  | TextAttributeSchema
  | NumberAttributeSchema
  | EnumAttributeSchema
  | BooleanAttributeSchema;
