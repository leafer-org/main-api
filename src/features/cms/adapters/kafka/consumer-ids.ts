import { createConsumerId } from '@/infra/lib/nest-kafka/index.js';

export const CMS_CONSUMER_ID = createConsumerId('cms-consumer');
