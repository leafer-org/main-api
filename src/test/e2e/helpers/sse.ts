import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

export type SseEvent = {
  /** Сырое тело блока без trailing `\n\n`. */
  raw: string;
  /** Значение строки `event: <type>`. Пустая строка, если строки нет. */
  eventType: string;
  /** Распарсенный JSON из конкатенации всех `data: ...` строк блока. */
  data: unknown;
};

export type SseStream = {
  /** Резолвится, когда заголовки получены — подписка SSE-handler'а уже активна. */
  ready: Promise<void>;
  /**
   * Ждёт следующее событие, удовлетворяющее предикату. По умолчанию — любое
   * событие (heartbeat-комментарии всегда отфильтровываются).
   * Если в очереди уже есть подходящее событие — возвращается сразу.
   */
  next(predicate?: (event: SseEvent) => boolean): Promise<SseEvent>;
  /** Закрыть соединение и отвергнуть все ожидающие next(). */
  close(): void;
};

type Waiter = {
  predicate: (event: SseEvent) => boolean;
  resolve: (event: SseEvent) => void;
  reject: (err: unknown) => void;
};

/**
 * Открывает SSE-соединение через raw `http.request` (минуя supertest, чтобы
 * не было конфликтов с другими параллельными HTTP-запросами на том же сервере).
 *
 * Принимает уже листенящий http.Server (если не listening — вызовет listen(0)).
 * Не выполняет повторных подключений — по дизайну SSE-стрима тикетов нет
 * догона событий после reconnect.
 */
export function openSseStream(
  server: http.Server,
  path: string,
  authToken: string,
): SseStream {
  const queue: SseEvent[] = [];
  const waiters: Waiter[] = [];
  let closed = false;
  let request: http.ClientRequest | null = null;

  let resolveReady: () => void = () => undefined;
  let rejectReady: (err: unknown) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const dispatch = (event: SseEvent): void => {
    for (let i = 0; i < waiters.length; i++) {
      const waiter = waiters[i]!;
      if (waiter.predicate(event)) {
        waiters.splice(i, 1);
        waiter.resolve(event);
        return;
      }
    }
    queue.push(event);
  };

  const failAll = (err: unknown): void => {
    while (waiters.length > 0) waiters.shift()!.reject(err);
  };

  const ensureListening = (): { port: number } => {
    const addr = server.address();
    if (addr && typeof addr !== 'string') return { port: addr.port };
    server.listen(0);
    const newAddr = server.address() as AddressInfo;
    return { port: newAddr.port };
  };

  const start = (): void => {
    const { port } = ensureListening();

    request = http.request(
      {
        host: '127.0.0.1',
        port,
        method: 'GET',
        path,
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'text/event-stream',
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          rejectReady(new Error(`SSE handshake failed: ${res.statusCode}`));
          res.resume();
          return;
        }
        resolveReady();

        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;
          for (;;) {
            const idx = buffer.indexOf('\n\n');
            if (idx === -1) return;
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);

            // Heartbeat / SSE-комментарий — пропускаем.
            if (block.startsWith(':')) continue;

            let eventType = '';
            let dataStr = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7);
              else if (line.startsWith('data: ')) dataStr += line.slice(6);
            }

            let data: unknown = null;
            try {
              data = dataStr.length > 0 ? JSON.parse(dataStr) : null;
            } catch {
              data = dataStr;
            }

            dispatch({ raw: block, eventType, data });
          }
        });
        res.on('error', (err) => failAll(err));
        res.on('end', () => {
          if (!closed) failAll(new Error('SSE stream ended unexpectedly'));
        });
      },
    );

    request.on('error', (err) => {
      if (closed) return;
      rejectReady(err);
      failAll(err);
    });

    request.end();
  };

  start();

  return {
    ready,
    next(predicate) {
      const pred = predicate ?? (() => true);
      if (closed) return Promise.reject(new Error('SSE stream is closed'));

      for (let i = 0; i < queue.length; i++) {
        const event = queue[i]!;
        if (pred(event)) {
          queue.splice(i, 1);
          return Promise.resolve(event);
        }
      }

      return new Promise<SseEvent>((resolve, reject) => {
        waiters.push({ predicate: pred, resolve, reject });
      });
    },
    close() {
      if (closed) return;
      closed = true;
      request?.destroy();
      failAll(new Error('SSE stream closed'));
    },
  };
}
