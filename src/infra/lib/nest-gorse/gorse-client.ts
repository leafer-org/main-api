import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { type GorseModuleOptions, MODULE_OPTIONS_TOKEN } from './tokens.js';

export type GorseItemPayload = {
  ItemId: string;
  IsHidden: boolean;
  Labels: string[];
  Categories: string[];
  Timestamp: string;
  Comment: string;
};

export type GorseFeedbackPayload = {
  FeedbackType: string;
  UserId: string;
  ItemId: string;
  Timestamp: string;
};

@Injectable()
export class GorseClient implements OnModuleInit {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly logger = new Logger(GorseClient.name);

  public constructor(
    @Inject(MODULE_OPTIONS_TOKEN)
    config: GorseModuleOptions,
  ) {
    this.baseUrl = config.url.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  public async onModuleInit() {
    try {
      const resp = await this.request<{ Ready: boolean }>('GET', '/api/health');
      this.logger.log(`Gorse health: ${JSON.stringify(resp)}`);
    } catch (e) {
      this.logger.warn(`Gorse health check failed: ${String(e)}`);
    }
  }

  public async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };

    const resp = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Gorse ${method} ${path} failed: ${resp.status} ${text}`);
    }

    const contentType = resp.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return (await resp.json()) as T;
    }
    return undefined as T;
  }

  public async upsertItem(itemId: string, payload: GorseItemPayload): Promise<void> {
    await this.request('PUT', `/api/item/${encodeURIComponent(itemId)}`, payload);
  }

  public async deleteItem(itemId: string): Promise<void> {
    await this.request('DELETE', `/api/item/${encodeURIComponent(itemId)}`);
  }

  public async insertItems(items: GorseItemPayload[]): Promise<void> {
    await this.request('POST', '/api/items', items);
  }

  public async insertFeedback(feedback: GorseFeedbackPayload[]): Promise<void> {
    await this.request('PUT', '/api/feedback', feedback);
  }

  public async deleteFeedback(feedbackType: string, userId: string, itemId: string): Promise<void> {
    await this.request(
      'DELETE',
      `/api/feedback/${encodeURIComponent(feedbackType)}/${encodeURIComponent(userId)}/${encodeURIComponent(itemId)}`,
    );
  }

  public async getRecommend(userId: string, params: URLSearchParams): Promise<string[]> {
    const qs = params.toString();
    return this.request<string[]>('GET', `/api/recommend/${encodeURIComponent(userId)}?${qs}`);
  }

  public async getPopular(params: URLSearchParams): Promise<{ Id: string; Score: number }[]> {
    const qs = params.toString();
    return this.request('GET', `/api/popular?${qs}`);
  }
}
