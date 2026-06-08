import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, IsIn, Min, Max, MaxLength, IsNotEmpty } from 'class-validator';
import { MoneyCodeMethod } from '@prisma/client';
import { MONEY_CODE_METHODS } from '@sally/shared-types';

export class CreateMoneyCodeDto {
  @ApiProperty({ example: 32000, description: 'Requested amount in cents' })
  @IsInt()
  @Min(100)
  @Max(9999999)
  requestedCents: number;

  @ApiProperty({ example: 'COMCHEK', enum: MONEY_CODE_METHODS })
  @IsString()
  @IsIn([...MONEY_CODE_METHODS])
  method: MoneyCodeMethod;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  stopId?: number;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  driverNote?: string;
}

export class ApproveMoneyCodeDto {
  @ApiProperty({ example: '4829-7712' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 32000, description: 'Approved amount in cents' })
  @IsInt()
  @Min(100)
  @Max(9999999)
  amountCents: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  dispatcherNote?: string;

  @ApiProperty({ required: false, default: 24 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  expiresInHours?: number;
}

export class DenyMoneyCodeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  dispatcherNote?: string;
}

export class IssueMoneyCodeDto {
  @ApiProperty({ example: '4829-7712' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 32000, description: 'Amount in cents' })
  @IsInt()
  @Min(100)
  @Max(9999999)
  amountCents: number;

  @ApiProperty({ example: 'COMCHEK', enum: MONEY_CODE_METHODS })
  @IsString()
  @IsIn([...MONEY_CODE_METHODS])
  method: MoneyCodeMethod;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  stopId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  dispatcherNote?: string;

  @ApiProperty({ required: false, default: 24 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  expiresInHours?: number;
}

export class UseMoneyCodeDto {
  @ApiProperty({ description: 'Actual amount paid (receipt amount) in cents' })
  @IsInt()
  @Min(100)
  @Max(9999999)
  actualAmountCents: number;

  @ApiProperty({ required: false, description: 'Receipt document ID' })
  @IsOptional()
  @IsInt()
  receiptDocumentId?: number;
}
