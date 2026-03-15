import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';

import {
  type TranscodeInput,
  type TranscodeOutput,
  VideoTranscoder,
} from '../../application/ports.js';

const exec = promisify(execFile);

type ProbeResult = {
  duration: number;
  width: number;
  height: number;
};

type HlsVariant = {
  resolution: string;
  height: number;
  bitrate: number;
  maxrate: string;
  bufsize: string;
};

const VARIANTS: HlsVariant[] = [
  { resolution: '640x360', height: 360, bitrate: 800, maxrate: '856k', bufsize: '1200k' },
  { resolution: '1280x720', height: 720, bitrate: 2500, maxrate: '2675k', bufsize: '3750k' },
  { resolution: '1920x1080', height: 1080, bitrate: 5000, maxrate: '5350k', bufsize: '7500k' },
];

const SEGMENT_DURATION = 6;
const THUMBNAIL_TIME = '00:00:02';

@Injectable()
export class FFmpegVideoTranscoder implements VideoTranscoder {
  private readonly logger = new Logger(FFmpegVideoTranscoder.name);

  public async transcode(input: TranscodeInput): Promise<TranscodeOutput> {
    const { localPath, outputDir } = input;

    const probe = await this.probe(localPath);
    this.logger.log(`Probed: ${probe.width}x${probe.height}, duration=${probe.duration}s`);

    const selectedVariants = VARIANTS.filter((v) => v.height <= probe.height);
    if (selectedVariants.length === 0) {
      const fallback = VARIANTS[0];
      if (fallback) selectedVariants.push(fallback);
    }

    await mkdir(outputDir, { recursive: true });

    const thumbnailPath = join(outputDir, 'thumbnail.jpg');
    await this.extractThumbnail(localPath, thumbnailPath);

    const hlsManifestPath = join(outputDir, 'master.m3u8');
    await this.transcodeToHls(localPath, outputDir, selectedVariants);

    return {
      hlsManifestPath,
      thumbnailPath,
      duration: Math.round(probe.duration),
      variants: selectedVariants.map((v) => ({
        resolution: v.resolution,
        bitrate: v.bitrate,
      })),
    };
  }

  private async probe(filePath: string): Promise<ProbeResult> {
    const { stdout } = await exec('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);

    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
    if (!videoStream) throw new Error('No video stream found');

    return {
      duration: Number.parseFloat(data.format?.duration ?? videoStream.duration ?? '0'),
      width: videoStream.width ?? 0,
      height: videoStream.height ?? 0,
    };
  }

  private async extractThumbnail(inputPath: string, outputPath: string): Promise<void> {
    await exec('ffmpeg', [
      '-i',
      inputPath,
      '-ss',
      THUMBNAIL_TIME,
      '-vframes',
      '1',
      '-vf',
      'scale=720:-2',
      '-q:v',
      '2',
      '-y',
      outputPath,
    ]);
  }

  private async transcodeToHls(
    inputPath: string,
    outputDir: string,
    variants: HlsVariant[],
  ): Promise<void> {
    const args: string[] = ['-i', inputPath];

    // Create variant directories upfront
    await Promise.all(
      variants.map((vr) => mkdir(join(outputDir, `${vr.height}p`), { recursive: true })),
    );

    for (let i = 0; i < variants.length; i++) {
      // biome-ignore lint/style/noNonNullAssertion: index is within bounds
      const v = variants[i]!;

      args.push(
        `-filter:v:${i}`,
        `scale=${v.resolution}`,
        `-c:v:${i}`,
        'libx264',
        `-b:v:${i}`,
        `${v.bitrate}k`,
        `-maxrate:v:${i}`,
        v.maxrate,
        `-bufsize:v:${i}`,
        v.bufsize,
      );
    }

    args.push(
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ac',
      '2',
      '-preset',
      'fast',
      '-g',
      String(SEGMENT_DURATION * 30),
      '-sc_threshold',
      '0',
      '-hls_time',
      String(SEGMENT_DURATION),
      '-hls_playlist_type',
      'vod',
      '-hls_flags',
      'independent_segments',
      '-hls_segment_type',
      'mpegts',
    );

    // Map each variant to its own stream and playlist
    for (let i = 0; i < variants.length; i++) {
      args.push('-map', '0:v:0', '-map', '0:a:0?');
    }

    // Use var_stream_map with named variants (360p, 720p, 1080p)
    const streamMap = variants.map((v, i) => `v:${i},a:${i},name:${v.height}p`).join(' ');
    args.push(
      '-var_stream_map',
      streamMap,
      '-hls_segment_filename',
      join(outputDir, '%v/segment_%03d.ts'),
      '-master_pl_name',
      'master.m3u8',
      '-y',
      join(outputDir, '%v/playlist.m3u8'),
    );

    this.logger.log(`Running FFmpeg with ${variants.length} variants`);
    await exec('ffmpeg', args, { timeout: 10 * 60 * 1000 });
  }
}
