import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { items, organizations } from '@/features/organization/adapters/db/schema.js';

export type SeedOrganizationInput = {
  id: string;
  name?: string;
  description?: string;
  avatarId?: string | null;
  media?: { type: string; mediaId: string }[];
  contacts?: { type: string; value: string; label?: string }[];
  team?: {
    title: string;
    members: {
      name: string;
      description?: string;
      media: { type: string; mediaId: string }[];
      employeeUserId?: string;
    }[];
  } | null;
  /** Если `false` — заполняем только draft (организация ещё не публиковалась). */
  published?: boolean;
  publishedAt?: Date;
};

export async function seedOrganizationPublished(
  connectionUri: string,
  input: SeedOrganizationInput,
): Promise<void> {
  const pool = new pg.Pool({ connectionString: connectionUri });
  const db = drizzle({ client: pool });
  const now = new Date();
  const publishedAt = input.publishedAt ?? now;

  const info = {
    name: input.name ?? 'Test Organization',
    description: input.description ?? '',
    avatarId: input.avatarId ?? null,
    media: input.media ?? [],
    contacts: input.contacts ?? [],
    team: input.team ?? { title: '', members: [] },
  };

  const state = {
    id: input.id,
    infoDraft: { ...info, status: 'draft', updatedAt: now.toISOString() },
    infoPublication:
      input.published === false
        ? null
        : { ...info, publishedAt: publishedAt.toISOString() },
    employees: [],
    roles: [],
    subscription: {
      planId: 'free',
      maxEmployees: 5,
      maxPublishedItems: 10,
      availableWidgetTypes: [],
    },
    claimToken: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  try {
    await db
      .insert(organizations)
      .values({
        id: input.id,
        state: state as never,
        claimToken: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: organizations.id,
        set: { state: state as never, updatedAt: now },
      });
  } finally {
    await pool.end();
  }
}

export async function unpublishOrganization(
  connectionUri: string,
  id: string,
): Promise<void> {
  const pool = new pg.Pool({ connectionString: connectionUri });
  const db = drizzle({ client: pool });
  const now = new Date();

  try {
    const rows = await db
      .select({ state: organizations.state })
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return;

    const state = row.state as { infoPublication: unknown };
    state.infoPublication = null;

    await db
      .update(organizations)
      .set({ state: state as never, updatedAt: now })
      .where(eq(organizations.id, id));
  } finally {
    await pool.end();
  }
}

export type SeedItemInput = {
  id: string;
  organizationId: string;
  typeId: string;
  widgets?: unknown[];
  publishedAt?: Date;
};

export async function seedItemPublished(
  connectionUri: string,
  input: SeedItemInput,
): Promise<void> {
  const pool = new pg.Pool({ connectionString: connectionUri });
  const db = drizzle({ client: pool });
  const now = new Date();
  const publishedAt = input.publishedAt ?? now;

  const state = {
    itemId: input.id,
    organizationId: input.organizationId,
    typeId: input.typeId,
    draft: null,
    publication: {
      widgets: input.widgets ?? [],
      publishedAt: publishedAt.toISOString(),
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  try {
    await db
      .insert(items)
      .values({
        id: input.id,
        organizationId: input.organizationId,
        typeId: input.typeId,
        state: state as never,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: items.id,
        set: { state: state as never, updatedAt: now },
      });
  } finally {
    await pool.end();
  }
}

export async function unpublishItem(connectionUri: string, id: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: connectionUri });
  const db = drizzle({ client: pool });

  try {
    await db.delete(items).where(eq(items.id, id));
  } finally {
    await pool.end();
  }
}
