import * as PublicSchema from './generated-public-schema.js';

export type ReqBody<T> = T extends { requestBody?: { content?: { 'application/json': infer F } } }
  ? F
  : never;
export type ReqQuery<T> = T extends { parameters?: { query?: infer F } } ? F : never;
export type ResOk<T> = T extends {
  responses?: { 200: { content?: { 'application/json': infer F } } };
}
  ? F
  : never;
export type ResCreated<T> = T extends {
  responses?: { 201: { content?: { 'application/json': infer F } } };
}
  ? F
  : never;

export type PublicBody = {
  [K in keyof PublicSchema.operations]: ReqBody<PublicSchema.operations[K]>;
};

export type PublicQuery = {
  [K in keyof PublicSchema.operations]: ReqQuery<PublicSchema.operations[K]>;
};

export type PublicResponse = {
  [K in keyof PublicSchema.operations]:
    | ResOk<PublicSchema.operations[K]>
    | ResCreated<PublicSchema.operations[K]>;
};

export type PublicSchemas = PublicSchema.components['schemas'];
