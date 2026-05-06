import { Inject, Injectable, Logger } from '@nestjs/common';

import { MainConfigService } from '@/infra/config/service.js';

/**
 * HTTP-клиент Centrifugo Server API (https://centrifugal.dev/docs/server/server_api).
 *
 * Минимальный набор: publish (отдельный канал) и broadcast (несколько каналов
 * за одну команду). Аутентификация через X-API-Key.
 *
 * Fire-and-forget: ошибки HTTP логируются, но не пробрасываются — потеря
 * realtime-сообщения не должна валить транзакцию domain-события (см. spec).
 */
@Injectable()
export class CentrifugoApiClient {
  private readonly logger = new Logger(CentrifugoApiClient.name);

  public constructor(@Inject(MainConfigService) private readonly config: MainConfigService) {}

  public async publish(channel: string, data: unknown): Promise<void> {
    await this.call('publish', { channel, data });
  }

  public async broadcast(channels: readonly string[], data: unknown): Promise<void> {
    if (channels.length === 0) return;
    await this.call('broadcast', { channels, data });
  }

  private async call(method: string, params: Record<string, unknown>): Promise<void> {
    const url = this.config.get('CENTRIFUGO_API_URL');
    const apiKey = this.config.get('CENTRIFUGO_API_KEY');

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({ method, params }),
      });
      if (!res.ok) {
        this.logger.warn(`centrifugo ${method} failed: HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { error?: { code: number; message: string } };
      if (body.error) {
        this.logger.warn(
          `centrifugo ${method} returned error ${body.error.code}: ${body.error.message}`,
        );
      }
    } catch (err) {
      this.logger.warn(`centrifugo ${method} threw: ${(err as Error).message}`);
    }
  }
}
