const GORSE_API_KEY = 'e2e-test-gorse-key';

function getGorseUrl(): string {
  const url = process.env.GORSE_URL;
  if (!url) throw new Error('GORSE_URL not set — did you call startContainers({ gorse: true })?');
  return url;
}

async function gorseRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const resp = await fetch(`${getGorseUrl()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': GORSE_API_KEY,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Gorse ${method} ${path}: ${resp.status} ${text}`);
  }

  const ct = resp.headers.get('content-type');
  if (ct?.includes('application/json')) return (await resp.json()) as T;
  return undefined as T;
}

/**
 * Вставляет items напрямую в Gorse (минуя Kafka).
 */
export async function gorseInsertItems(items: { ItemId: string; Labels: string[]; Categories?: string[]; Timestamp?: string }[]): Promise<void> {
  await gorseRequest('POST', '/api/items', items.map(i => ({
    ItemId: i.ItemId,
    IsHidden: false,
    Labels: i.Labels,
    Categories: i.Categories ?? [],
    Timestamp: i.Timestamp ?? new Date().toISOString(),
    Comment: '',
  })));
}

/**
 * Вставляет feedback напрямую в Gorse (минуя Kafka).
 */
export async function gorseInsertFeedback(feedback: { UserId: string; ItemId: string; FeedbackType: string }[]): Promise<void> {
  await gorseRequest('PUT', '/api/feedback', feedback.map(f => ({
    FeedbackType: f.FeedbackType,
    UserId: f.UserId,
    ItemId: f.ItemId,
    Timestamp: new Date().toISOString(),
  })));
}

/**
 * Поллит `/api/popular` пока не появятся результаты.
 * Надёжнее чем отслеживать задачи — проверяем конечный результат.
 */
export async function waitForGorsePopular(
  timeoutMs = 120_000,
  intervalMs = 2_000,
  category?: string,
): Promise<{ Id: string; Score: number }[]> {
  const deadline = Date.now() + timeoutMs;

  const poll = async (): Promise<{ Id: string; Score: number }[]> => {
    if (Date.now() >= deadline) {
      throw new Error(`Gorse popular items not ready within ${timeoutMs}ms`);
    }

    const qs = new URLSearchParams({ n: '10' });
    if (category) qs.set('category', category);
    const results = await gorseRequest<{ Id: string; Score: number }[]>('GET', `/api/non-personalized/popular?${qs.toString()}`);

    if (results.length > 0) {
      console.log(`[waitForGorsePopular] got ${results.length} popular items`);
      return results;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
    return poll();
  };

  return poll();
}

/**
 * Поллит `/api/recommend/{userId}` пока не появятся персонализированные рекомендации.
 */
export async function waitForGorseRecommendations(
  userId: string,
  timeoutMs = 120_000,
  intervalMs = 2_000,
  category?: string,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;

  const poll = async (): Promise<string[]> => {
    if (Date.now() >= deadline) {
      throw new Error(`Gorse recommendations for user ${userId} not ready within ${timeoutMs}ms`);
    }

    const qs = new URLSearchParams({ n: '10' });
    if (category) qs.set('category', category);

    const ids = await gorseRequest<string[]>(
      'GET',
      `/api/recommend/${encodeURIComponent(userId)}?${qs.toString()}`,
    );

    if (ids.length > 0) {
      console.log(`[waitForGorseRecommendations] got ${ids.length} recommendations for ${userId}`);
      return ids;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
    return poll();
  };

  return poll();
}
