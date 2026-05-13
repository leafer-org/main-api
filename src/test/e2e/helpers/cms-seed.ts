import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { cmsCategories, cmsItemTypes } from '@/features/cms/adapters/db/schema.js';

export type SeedCategoryInput = {
  id: string;
  parentCategoryId?: string | null;
  name?: string;
  iconId?: string;
  order?: number;
  allowedTypeIds?: string[];
  ageGroups?: string[];
  attributes?: Array<{
    attributeId: string;
    name: string;
    required: boolean;
    schema: unknown;
  }>;
  status?: 'draft' | 'published' | 'unpublished';
  publishedAt?: Date | null;
};

export async function seedCmsCategory(
  connectionUri: string,
  input: SeedCategoryInput,
): Promise<void> {
  const pool = new pg.Pool({ connectionString: connectionUri });
  const db = drizzle({ client: pool });
  const now = new Date();
  try {
    await db
      .insert(cmsCategories)
      .values({
        id: input.id,
        parentCategoryId: input.parentCategoryId ?? null,
        name: input.name ?? 'Test Category',
        iconId: input.iconId ?? '00000000-0000-0000-0000-000000000000',
        order: input.order ?? 0,
        allowedTypeIds: input.allowedTypeIds ?? [],
        ageGroups: input.ageGroups ?? [],
        attributes: input.attributes ?? [],
        status: input.status ?? 'published',
        publishedAt: input.publishedAt ?? (input.status === 'published' || !input.status ? now : null),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: cmsCategories.id,
        set: {
          parentCategoryId: input.parentCategoryId ?? null,
          name: input.name ?? 'Test Category',
          iconId: input.iconId ?? '00000000-0000-0000-0000-000000000000',
          order: input.order ?? 0,
          allowedTypeIds: input.allowedTypeIds ?? [],
          ageGroups: input.ageGroups ?? [],
          attributes: input.attributes ?? [],
          status: input.status ?? 'published',
          publishedAt:
            input.publishedAt ?? (input.status === 'published' || !input.status ? now : null),
          updatedAt: now,
        },
      });
  } finally {
    await pool.end();
  }
}

export type SeedItemTypeInput = {
  id: string;
  name?: string;
  label?: string;
  widgetSettings?: unknown[];
};

export async function seedCmsItemType(
  connectionUri: string,
  input: SeedItemTypeInput,
): Promise<void> {
  const pool = new pg.Pool({ connectionString: connectionUri });
  const db = drizzle({ client: pool });
  const now = new Date();
  try {
    await db
      .insert(cmsItemTypes)
      .values({
        id: input.id,
        name: input.name ?? 'Service',
        label: input.label ?? 'услугу',
        widgetSettings: input.widgetSettings ?? [],
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: cmsItemTypes.id,
        set: {
          name: input.name ?? 'Service',
          label: input.label ?? 'услугу',
          widgetSettings: input.widgetSettings ?? [],
          updatedAt: now,
        },
      });
  } finally {
    await pool.end();
  }
}
