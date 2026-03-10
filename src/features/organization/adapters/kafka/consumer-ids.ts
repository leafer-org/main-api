import { createConsumerId } from '@/infra/lib/nest-kafka/index.js';

export const ORGANIZATION_CONSUMER_ID = createConsumerId('organization-consumer');
