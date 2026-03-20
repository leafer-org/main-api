import { execFile, spawn } from 'node:child_process';
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
  hasAudio: boolean;
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
    const { localPath, outputDir, onProgress } = input;

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

    const mp4PreviewPath = join(outputDir, 'preview.mp4');
    const previewHeight = Math.min(480, probe.height);
    await this.generateMp4Preview(localPath, mp4PreviewPath, probe.duration, previewHeight);

    const hlsManifestPath = join(outputDir, 'master.m3u8');
    await this.transcodeToHls(localPath, outputDir, selectedVariants, probe.duration, probe.hasAudio, onProgress);

    return {
      hlsManifestPath,
      thumbnailPath,
      mp4PreviewPath,
      duration: Math.round(probe.duration),
      width: probe.width,
      height: probe.height,
      variants: selectedVariants.map((v) => ({
        resolution: v.resolution,
        bitrate: v.bitrate,
      })),
    };
  }

  private async probe(filePath: string): Promise<ProbeResult> {
    this.logger.log(`Probing ${filePath}`);
    try {
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
      const hasAudio = data.streams?.some((s: { codec_type: string }) => s.codec_type === 'audio') ?? false;

      return {
        duration: Number.parseFloat(data.format?.duration ?? videoStream.duration ?? '0'),
        width: videoStream.width ?? 0,
        height: videoStream.height ?? 0,
        hasAudio,
      };
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? '';
      this.logger.error(`Probe failed: ${stderr}`);
      throw err;
    }
  }

  private async extractThumbnail(inputPath: string, outputPath: string): Promise<void> {
    this.logger.log(`Extracting thumbnail → ${outputPath}`);
    try {
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
      ], { maxBuffer: 10 * 1024 * 1024 });
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? '';
      this.logger.error(`Thumbnail extraction failed: ${stderr}`);
      throw err;
    }
  }

  private async generateMp4Preview(
    inputPath: string,
    outputPath: string,
    duration: number,
    height: number,
  ): Promise<void> {
    // Ensure even height for libx264
    const h = height % 2 === 0 ? height : height - 1;
    const args = ['-i', inputPath];

    if (duration > 30) {
      args.push('-t', '30');
    }

    args.push(
      '-vf', `scale=-2:${h}`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '28',
      '-an',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    );

    this.logger.log(`Generating MP4 preview (${h}p, max 30s) → ${outputPath}`);
    this.logger.debug(`MP4 preview args: ffmpeg ${args.join(' ')}`);
    try {
      await exec('ffmpeg', args, { maxBuffer: 10 * 1024 * 1024 });
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? '';
      this.logger.error(`MP4 preview generation failed: ${stderr}`);
      throw err;
    }
  }

  private async transcodeToHls(
    inputPath: string,
    outputDir: string,
    variants: HlsVariant[],
    totalDuration: number,
    hasAudio: boolean,
    onProgress?: (percent: number) => void,
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

    if (hasAudio) {
      args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2');
    }

    args.push(
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
      args.push('-map', '0:v:0');
      if (hasAudio) args.push('-map', '0:a:0');
    }

    // Use var_stream_map with named variants (360p, 720p, 1080p)
    const streamMap = hasAudio
      ? variants.map((v, i) => `v:${i},a:${i},name:${v.height}p`).join(' ')
      : variants.map((v, i) => `v:${i},name:${v.height}p`).join(' ');
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

    this.logger.log(`Running HLS transcode with ${variants.length} variants`);
    this.logger.debug(`HLS args: ffmpeg ${args.join(' ')}`);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('FFmpeg timed out after 10 minutes'));
      }, 10 * 60 * 1000);

      let stderrBuf = '';

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString();

        if (!onProgress || totalDuration <= 0) return;

        const timeMatch = /time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/.exec(stderrBuf);
        if (timeMatch) {
          const hours = Number(timeMatch[1]);
          const minutes = Number(timeMatch[2]);
          const seconds = Number(timeMatch[3]);
          const centis = Number(timeMatch[4]);
          const currentTime = hours * 3600 + minutes * 60 + seconds + centis / 100;
          const percent = Math.min(Math.round((currentTime / totalDuration) * 100), 100);
          onProgress(percent);
          // Keep only the last chunk to avoid memory buildup
          stderrBuf = stderrBuf.slice(-512);
        }
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          this.logger.error(`HLS transcode failed (code ${code}): ${stderrBuf.slice(-2000)}`);
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }
}
