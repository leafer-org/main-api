import { createConsumerId } from '@/infra/lib/nest-kafka/index.js';

export const CHAT_CONSUMER_ID = createConsumerId('chat-consumer');
