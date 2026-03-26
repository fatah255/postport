import { execFile } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";

const execFileAsync = promisify(execFile);

export interface VideoProbeResult {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  fps: number | null;
  codec: string | null;
  bitrate: number | null;
  raw: Record<string, unknown>;
}

export interface ImageProbeResult {
  width: number | null;
  height: number | null;
  codec: string | null;
  raw: Record<string, unknown>;
}

export const probeImage = async (filePath: string): Promise<ImageProbeResult> => {
  const metadata = await sharp(filePath).metadata();

  return {
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    codec: metadata.format ?? null,
    raw: metadata as unknown as Record<string, unknown>
  };
};

export const createImageThumbnail = async (inputPath: string, outputPath: string) => {
  await mkdir(dirname(outputPath), { recursive: true });
  await sharp(inputPath)
    .rotate()
    .resize({
      width: 480,
      height: 480,
      fit: "inside",
      withoutEnlargement: true
    })
    .jpeg({ quality: 84 })
    .toFile(outputPath);
};

export const probeVideo = async (filePath: string): Promise<VideoProbeResult> => {
  if (!ffprobe.path) {
    throw new Error("ffprobe-static binary is unavailable.");
  }

  const { stdout } = await execFileAsync(ffprobe.path, [
    "-v",
    "error",
    "-show_entries",
    "format=duration,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate",
    "-of",
    "json",
    filePath
  ]);

  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string; bit_rate?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      avg_frame_rate?: string;
    }>;
  };

  const videoStream = parsed.streams?.find((stream) => stream.codec_type === "video");

  return {
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
    durationMs: parsed.format?.duration ? Math.round(Number(parsed.format.duration) * 1000) : null,
    fps: parseFps(videoStream?.avg_frame_rate ?? videoStream?.r_frame_rate),
    codec: videoStream?.codec_name ?? null,
    bitrate: parsed.format?.bit_rate ? Number(parsed.format.bit_rate) : null,
    raw: parsed as Record<string, unknown>
  };
};

export const extractVideoThumbnail = async (inputPath: string, outputPath: string, durationMs?: number | null) => {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static binary is unavailable.");
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const timestampSeconds =
    durationMs && durationMs > 0 ? Math.max(0, Math.min(1, durationMs / 2000)) : 0;

  await execFileAsync(ffmpegPath, [
    "-y",
    "-ss",
    timestampSeconds.toFixed(2),
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-vf",
    "scale=480:-2",
    outputPath
  ]);
};

export const normalizeVideo = async (inputPath: string, outputPath: string) => {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static binary is unavailable.");
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await execFileAsync(ffmpegPath, [
    "-y",
    "-i",
    inputPath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    outputPath
  ]);

  return stat(outputPath);
};

export const shouldNormalizeVideo = (mimeType: string, codec: string | null) => {
  if (mimeType !== "video/mp4") {
    return true;
  }

  return codec !== "h264";
};

const parseFps = (value?: string) => {
  if (!value) {
    return null;
  }

  const [numeratorRaw, denominatorRaw] = value.split("/");
  const numerator = Number(numeratorRaw);
  const denominator = Number(denominatorRaw ?? "1");
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }

  return Number((numerator / denominator).toFixed(3));
};
