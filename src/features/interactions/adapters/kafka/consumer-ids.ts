import { createConsumerId } from '@/infra/lib/nest-kafka/index.js';

export const INTERACTIONS_CONSUMER_ID = createConsumerId('interactions-consumer');
