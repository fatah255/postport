import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

export class StorageService {
  private readonly s3 = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY
    },
    forcePathStyle: env.S3_FORCE_PATH_STYLE
  });

  async downloadObject(objectKey: string, destinationPath: string) {
    await mkdir(dirname(destinationPath), { recursive: true });

    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey
      })
    );

    if (!response.Body) {
      throw new Error(`Object ${objectKey} returned an empty response body.`);
    }

    await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(destinationPath));
  }

  async uploadFile(input: { objectKey: string; filePath: string; contentType: string }) {
    const { readFile } = await import("node:fs/promises");
    const buffer = await readFile(input.filePath);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: input.objectKey,
        Body: buffer,
        ContentType: input.contentType
      })
    );
  }

  async createSignedDownloadUrl(objectKey: string, expiresInSeconds = env.SIGNED_MEDIA_URL_EXPIRY_SECONDS) {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey
      }),
      {
        expiresIn: expiresInSeconds
      }
    );
  }
}

export const storage = new StorageService();
