export type ConsumerId = symbol;

export function createConsumerId(description: string): ConsumerId {
  return Symbol(description);
}
