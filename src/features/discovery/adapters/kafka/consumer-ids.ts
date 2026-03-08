import { createConsumerId } from '@/infra/lib/nest-kafka/index.js';

export const DISCOVERY_CONSUMER_ID = createConsumerId('discovery-consumer');
