import { S3Client } from '@aws-sdk/client-s3';
import { FileStorageService } from '../file-storage.service';

// Only the client construction is under test here; the key and presign cases live in file-storage.service.spec.ts
// with the real client.
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

function configService(values: Record<string, string>) {
  return {
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  };
}

describe('FileStorageService S3 client', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses plain region config when no endpoint is set (AWS S3)', () => {
    new FileStorageService(configService({ 's3.region': 'eu-west-1' }) as never);

    expect(S3Client).toHaveBeenCalledWith({ region: 'eu-west-1' });
  });

  it('adds the endpoint and path-style addressing for an S3-compatible store (local MinIO)', () => {
    new FileStorageService(
      configService({ 's3.region': 'us-east-1', 's3.endpoint': 'http://localhost:9300' }) as never,
    );

    expect(S3Client).toHaveBeenCalledWith({
      region: 'us-east-1',
      endpoint: 'http://localhost:9300',
      forcePathStyle: true,
    });
  });

  it('treats an empty endpoint as unset', () => {
    new FileStorageService(configService({ 's3.region': 'us-east-1', 's3.endpoint': '' }) as never);

    expect(S3Client).toHaveBeenCalledWith({ region: 'us-east-1' });
  });
});
