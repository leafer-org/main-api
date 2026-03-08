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
 * Запускает полный цикл обучения модели и ожидает его завершения.
 *
 * Gorse-in-one не имеет явного эндпоинта "trigger fit",
 * но мы можем отслеживать прогресс через dashboard/tasks.
 * Для тестов используется короткий `model_fit_period` (1m) в config,
 * поэтому просто ждём, пока все задачи закончатся.
 *
 * @param timeoutMs — максимальное время ожидания (по умолчанию 120с)
 * @param intervalMs — интервал опроса (по умолчанию 2с)
 */
export async function waitForGorseTraining(timeoutMs = 120_000, intervalMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  // Ждём, пока появится хотя бы одна завершённая задача обучения
  while (Date.now() < deadline) {
    const tasks = await gorseRequest<
      { Name: string; Status: string; Done: boolean; StartTime: string; FinishTime: string }[]
    >('GET', '/api/dashboard/tasks');

    const fitTasks = tasks.filter(
      (t) => t.Name === 'Fit collaborative filtering model' || t.Name.startsWith('Fit'),
    );

    if (fitTasks.length > 0 && fitTasks.every((t) => t.Done)) {
      console.log(`[waitForGorseTraining] training done (${fitTasks.length} tasks)`);
      return;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Gorse training did not complete within ${timeoutMs}ms`);
}

/**
 * Ожидает, пока offline рекомендации будут сгенерированы для указанного пользователя.
 * Полезно после вставки items+feedback и запуска обучения.
 *
 * @param userId — ID пользователя
 * @param timeoutMs — максимальное время ожидания (по умолчанию 120с)
 * @param intervalMs — интервал опроса (по умолчанию 2с)
 */
export async function waitForGorseRecommendations(
  userId: string,
  timeoutMs = 120_000,
  intervalMs = 2_000,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const qs = new URLSearchParams({ n: '10' });
    const ids = await gorseRequest<string[]>(
      'GET',
      `/api/recommend/${encodeURIComponent(userId)}?${qs}`,
    );

    if (ids.length > 0) {
      console.log(`[waitForGorseRecommendations] got ${ids.length} recommendations for ${userId}`);
      return ids;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Gorse recommendations for user ${userId} not ready within ${timeoutMs}ms`);
}
