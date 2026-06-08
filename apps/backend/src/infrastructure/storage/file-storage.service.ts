import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get<string>('s3.bucket', 'sally-documents');
    const region = this.configService.get<string>('s3.region', 'us-east-1');

    this.s3Client = new S3Client({ region });
  }

  generateS3Key(params: { tenantId: number; entityType: string; entityId: number; fileName: string }): string {
    const uuid = randomUUID();
    const sanitized = this.sanitizeFileName(params.fileName);
    return `tenants/${params.tenantId}/documents/${params.entityType}/${params.entityId}/${uuid}_${sanitized}`;
  }

  sanitizeFileName(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    const ext = lastDot > 0 ? fileName.slice(lastDot) : '';
    let name = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;

    name = name
      .replace(/[<>:"|?*\\/[\](){}]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const maxNameLength = 200 - ext.length;
    if (name.length > maxNameLength) {
      name = name.slice(0, maxNameLength);
    }

    return name + ext;
  }

  async generatePresignedUploadUrl(s3Key: string, mimeType: string, expiresInSeconds = 300): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: mimeType,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  async generatePresignedDownloadUrl(s3Key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  async uploadBuffer(s3Key: string, buffer: Buffer, mimeType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType,
    });

    await this.s3Client.send(command);
    this.logger.log(`Uploaded file to S3: ${s3Key}`);
  }

  /**
   * Download a file from S3 and return its contents as a Buffer.
   */
  async downloadBuffer(s3Key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    const response = await this.s3Client.send(command);

    if (!response.Body) {
      throw new NotFoundException(`S3 object not found: ${s3Key}`);
    }

    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  /**
   * Generate an S3 key for a ratecon upload (before load creation).
   */
  generateRateconUploadKey(tenantId: number, fileName: string): string {
    const sanitized = this.sanitizeFileName(fileName);
    const uuid = randomUUID().slice(0, 13);
    return `tenants/${tenantId}/ratecon-uploads/${uuid}_${sanitized}`;
  }

  async deleteObject(s3Key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    await this.s3Client.send(command);
    this.logger.log(`Deleted file from S3: ${s3Key}`);
  }
}
