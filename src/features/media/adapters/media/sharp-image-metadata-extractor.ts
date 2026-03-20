import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

import { ImageMetadataExtractor, type ImageMetadata } from '../../application/ports.js';

@Injectable()
export class SharpImageMetadataExtractor implements ImageMetadataExtractor {
  public async extract(stream: Readable): Promise<ImageMetadata> {
    const pipeline = sharp();
    stream.pipe(pipeline);

    const metadata = await pipeline.metadata();

    if (!metadata.width || !metadata.height || !metadata.format) {
      throw new Error('Failed to extract image metadata: missing width, height or format');
    }

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    };
  }
}
