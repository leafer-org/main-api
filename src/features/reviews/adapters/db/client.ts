import * as schema from './schema.js';
import { CreateDatabaseClient } from '@/infra/lib/nest-drizzle/index.js';

export class ReviewDatabaseClient extends CreateDatabaseClient(schema) {}
