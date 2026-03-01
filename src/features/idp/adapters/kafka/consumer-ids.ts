import { createConsumerId } from '@/infra/lib/nest-kafka/index.js';

export const IDP_CONSUMER_ID = createConsumerId('idp-consumer');
