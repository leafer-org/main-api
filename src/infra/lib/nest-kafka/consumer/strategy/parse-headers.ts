import type Kafka from 'node-rdkafka';

export function parseHeaders(headers: Kafka.MessageHeader[] | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const header of headers) {
    for (const [key, value] of Object.entries(header)) {
      result[key] = String(value);
    }
  }
  return result;
}
