import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { RequireFeature } from '../../../../auth/decorators/require-feature.decorator';
import { UserRole } from '@prisma/client';
import { FuelReceiptParserService } from './fuel-receipt-parser.service';
import { ALLOWED_MIME_TYPES, FUEL_RECEIPT_FIELD_COUNT } from './fuel-receipt.schema';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@ApiTags('IFTA - Fuel Receipt Scanning')
@ApiBearerAuth()
@Controller('ifta/fuel-receipts')
@RequireFeature('ifta')
export class FuelReceiptController {
  private readonly logger = new Logger(FuelReceiptController.name);

  constructor(private readonly fuelReceiptParser: FuelReceiptParserService) {}

  @Post('scan')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Scan a fuel receipt image and extract purchase data',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async scanReceipt(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}. Accepted: JPEG, PNG, WebP, HEIC, PDF.`);
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File size must be less than 10MB.');
    }

    this.logger.log(`Scanning fuel receipt: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);

    const result = await this.fuelReceiptParser.parse(file.buffer, file.mimetype);

    const fieldsExtracted = Object.values(result.data).filter((v) => v !== null).length;

    return {
      extracted: result.data,
      fieldsExtracted,
      totalFields: FUEL_RECEIPT_FIELD_COUNT,
      parsing: result.parsing,
    };
  }
}
