import { createHmac } from 'node:crypto';

import { ImageProxyUrlSigner } from '../../application/ports.js';

export class ImgproxyUrlSigner implements ImageProxyUrlSigner {
  private readonly key: Buffer;
  private readonly salt: Buffer;

  public constructor(keyHex: string, saltHex: string) {
    this.key = Buffer.from(keyHex, 'hex');
    this.salt = Buffer.from(saltHex, 'hex');
  }

  public sign(path: string): string {
    const hmac = createHmac('sha256', this.key);
    hmac.update(this.salt);
    hmac.update(path);
    const signature = hmac.digest('base64url');
    return `/${signature}${path}`;
  }
}
