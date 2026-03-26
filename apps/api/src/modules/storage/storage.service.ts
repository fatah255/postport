import { Injectable } from "@nestjs/common";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../../config/env";

export interface SignedUploadRequest {
  objectKey: string;
  mimeType: string;
  contentLength?: number;
}

@Injectable()
export class StorageService {
  private readonly s3: S3Client;

  constructor() {
    this.s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY
      },
      forcePathStyle: env.S3_FORCE_PATH_STYLE
    });
  }

  async createSignedUploadUrl(input: SignedUploadRequest): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: input.objectKey,
      ContentType: input.mimeType
    });

    return getSignedUrl(this.s3, command, {
      expiresIn: env.SIGNED_UPLOAD_EXPIRY_SECONDS
    });
  }

  async createMultipartUpload(input: SignedUploadRequest) {
    const response = await this.s3.send(
      new CreateMultipartUploadCommand({
        Bucket: env.S3_BUCKET,
        Key: input.objectKey,
        ContentType: input.mimeType
      })
    );

    if (!response.UploadId) {
      throw new Error("Multipart upload could not be initialized.");
    }

    return {
      uploadId: response.UploadId
    };
  }

  async createSignedMultipartPartUrl(input: { objectKey: string; uploadId: string; partNumber: number }) {
    return getSignedUrl(
      this.s3,
      new UploadPartCommand({
        Bucket: env.S3_BUCKET,
        Key: input.objectKey,
        UploadId: input.uploadId,
        PartNumber: input.partNumber
      }),
      {
        expiresIn: env.SIGNED_UPLOAD_EXPIRY_SECONDS
      }
    );
  }

  async completeMultipartUpload(input: {
    objectKey: string;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
  }) {
    const normalizedParts: CompletedPart[] = input.parts
      .slice()
      .sort((left, right) => left.partNumber - right.partNumber)
      .map((part) => ({
        PartNumber: part.partNumber,
        ETag: part.etag
      }));

    return this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: env.S3_BUCKET,
        Key: input.objectKey,
        UploadId: input.uploadId,
        MultipartUpload: {
          Parts: normalizedParts
        }
      })
    );
  }

  async abortMultipartUpload(input: { objectKey: string; uploadId: string }) {
    return this.s3.send(
      new AbortMultipartUploadCommand({
        Bucket: env.S3_BUCKET,
        Key: input.objectKey,
        UploadId: input.uploadId
      })
    );
  }

  publicUrlForObject(objectKey: string): string {
    const trimmedEndpoint = env.S3_ENDPOINT.replace(/\/+$/, "");
    return `${trimmedEndpoint}/${env.S3_BUCKET}/${objectKey}`;
  }

  async objectExists(objectKey: string) {
    try {
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: objectKey
        })
      );
      return true;
    } catch {
      return false;
    }
  }
}
