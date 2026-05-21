import { createConsumerId } from '@/infra/lib/nest-kafka/index.js';

export const POSTS_CONSUMER_ID = createConsumerId('posts-consumer');
