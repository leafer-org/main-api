import Type from 'typebox';
import type { TLocalizedValidationError } from 'typebox/error';
import Value from 'typebox/value';

export class ConfigValidationError extends Error {
  public errors: TLocalizedValidationError[];
  public constructor(schema: Type.TSchema, value: unknown, options?: ErrorOptions) {
    const errors = Value.Errors(schema, value);
    const messages = errors.map((e) => `${e.schemaPath} -> ${e.message}`).join('\n');
    super(`config invalid: ${messages}`, options);
    this.errors = errors;
  }
}
