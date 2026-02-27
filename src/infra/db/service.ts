import * as schema from './schema/index.js';
import { CreateDatabaseClient } from '@/infra/lib/nest-drizzle/index.js';

export class DatabaseClient extends CreateDatabaseClient(schema) {}
