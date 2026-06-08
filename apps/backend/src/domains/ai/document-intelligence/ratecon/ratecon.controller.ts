import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Query,
  BadRequestException,
  ConflictException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { RequireFeature } from '../../../../auth/decorators/require-feature.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { JobStatusSchema } from '@sally/shared-types';
import { QUEUE_NAMES, DOCUMENTS_JOB_NAMES, bullJobIdFromDbId } from '../../../../infrastructure/queue/queue.constants';
import { JobService } from '../../../../infrastructure/queue/job.service';
import { buildJobEnvelope } from '../../../../infrastructure/queue/job-envelope.helper';

const JOB_STATUS = JobStatusSchema.enum;
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { FileStorageService } from '../../../../infrastructure/storage/file-storage.service';

@ApiTags('AI - Document Intelligence')
@ApiBearerAuth()
@Controller('ai/documents')
@RequireFeature('doc_intelligence')
export class RateconController {
  constructor(
    @InjectQueue(QUEUE_NAMES.DOCUMENTS)
    private readonly documentsQueue: Queue,
    private readonly documentJobService: JobService,
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
    private readonly configService: ConfigService,
  ) {}

  @Post('parse-ratecon')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Upload a rate confirmation PDF for async parsing' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({
    name: 'force',
    required: false,
    type: Boolean,
    description: 'Bypass cache and re-parse with AI',
  })
  @ApiQuery({
    name: 'strategy',
    required: false,
    enum: ['text-first', 'vision'],
    description: 'Parser strategy override',
  })
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async parseRatecon(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
    @Query('force') force?: string,
    @Query('strategy') strategy?: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    this.validatePdf(file);

    return this.processFile(file, user, force === 'true', strategy);
  }

  @Post('parse-ratecon/bulk')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Upload multiple rate confirmation PDFs for async parsing',
  })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({
    name: 'force',
    required: false,
    type: Boolean,
    description: 'Bypass cache and re-parse with AI',
  })
  @ApiQuery({
    name: 'strategy',
    required: false,
    enum: ['text-first', 'vision'],
    description: 'Parser strategy override',
  })
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 10 * 1024 * 1024 } }))
  async parseRateconBulk(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: any,
    @Query('force') force?: string,
    @Query('strategy') strategy?: string,
  ) {
    if (!files || files.length === 0) throw new BadRequestException('No files provided');

    files.forEach((f) => this.validatePdf(f));

    const results = await Promise.all(files.map((f) => this.processFile(f, user, force === 'true', strategy)));
    return results;
  }

  @Get('parser-config')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get ratecon parser configuration' })
  getParserConfig() {
    return {
      defaultStrategy: this.configService.get<string>('ratecon.parserStrategy') || 'text-first',
      allowUserOverride: this.configService.get<boolean>('ratecon.allowUserOverride') || false,
      aiProvider: process.env.RATECON_AI_PROVIDER || 'anthropic',
      model: process.env.RATECON_MODEL || 'standard',
      fallbackEnabled: process.env.RATECON_FALLBACK_ENABLED === 'true',
      fallbackModel: process.env.RATECON_FALLBACK_MODEL || 'powerful',
      timeoutMs: parseInt(process.env.RATECON_TIMEOUT_MS || '60000', 10),
      fallbackTimeoutMs: parseInt(process.env.RATECON_FALLBACK_TIMEOUT_MS || '120000', 10),
    };
  }

  private validatePdf(file: Express.Multer.File) {
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException(`Only PDF files are accepted: ${file.originalname}`);
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException(`File size must be less than 10MB: ${file.originalname}`);
    }
  }

  private resolveStrategy(queryStrategy?: string): 'text-first' | 'vision' {
    const allowOverride = this.configService.get<boolean>('ratecon.allowUserOverride');
    if (allowOverride && (queryStrategy === 'vision' || queryStrategy === 'text-first')) {
      return queryStrategy;
    }
    return (this.configService.get<string>('ratecon.parserStrategy') as 'text-first' | 'vision') || 'text-first';
  }

  /**
   * Upload to S3 first, then queue for processing.
   * No more base64 in the queue payload — just an S3 key.
   */
  private async processFile(file: Express.Multer.File, user: any, forceReparse: boolean, queryStrategy?: string) {
    const strategy = this.resolveStrategy(queryStrategy);

    // Include strategy in hash so different strategies produce separate cache entries
    const hashInput = Buffer.concat([file.buffer, Buffer.from(strategy)]);
    const inputHash = createHash('sha256').update(hashInput).digest('hex');

    // Duplicate detection — block if load already exists for this hash
    if (!forceReparse) {
      const existing = await this.documentJobService.findActiveLoadByHash(
        user.tenantDbId,
        'documents',
        'ratecon',
        inputHash,
      );
      if (existing) {
        throw new ConflictException({
          statusCode: 409,
          message: `This file was already imported as Load #${existing.loadNumber}`,
          loadNumber: existing.loadNumber,
        });
      }
    }

    // Upload to S3 immediately
    const s3Key = this.fileStorage.generateRateconUploadKey(user.tenantDbId, file.originalname);
    await this.fileStorage.uploadBuffer(s3Key, file.buffer, 'application/pdf');

    const dbUser = await this.prisma.user.findUnique({
      where: { userId: user.userId },
      select: { id: true },
    });

    const job = await this.documentJobService.createJob({
      tenantId: user.tenantDbId,
      submittedBy: dbUser?.id ?? 0,
      category: 'documents',
      type: 'ratecon',
      inputData: {
        fileName: file.originalname,
        fileSize: file.size,
        s3Key,
        strategy,
      },
      inputHash,
    });

    await this.documentsQueue.add(
      DOCUMENTS_JOB_NAMES.RATECON,
      buildJobEnvelope(
        {
          jobId: job.id,
          tenantId: user.tenantDbId,
          submittedByUserId: user.userId,
          submittedByDbId: dbUser?.id ?? 0,
          fileName: file.originalname,
          s3Key,
          strategy,
          inputHash,
          forceReparse,
        },
        { tenantId: String(user.tenantDbId), source: 'api', userId: user.userId },
      ),
      {
        jobId: bullJobIdFromDbId('documents', job.id),
        attempts: 2,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86400, count: 200 },
      },
    );

    return {
      jobId: job.id,
      status: JOB_STATUS.QUEUED,
      fileName: file.originalname,
    };
  }
}
