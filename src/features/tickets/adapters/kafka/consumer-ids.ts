import { createConsumerId } from '@/infra/lib/nest-kafka/index.js';

export const TICKETS_CONSUMER_ID = createConsumerId('tickets-consumer');
