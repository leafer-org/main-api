import { createHmac } from 'node:crypto';

import { ImageProxyUrlSigner } from '../../application/ports.js';

export class HmacImageProxyUrlSigner implements ImageProxyUrlSigner {
  public constructor(private readonly secret: string) {}

  public sign(url: string): string {
    const signature = createHmac('sha256', this.secret).update(url).digest('hex');
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}signature=${signature}`;
  }
}
