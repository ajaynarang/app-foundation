import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  Min,
  Length,
  ValidateIf,
} from 'class-validator';
import type { CreateCustomer } from '@sally/shared-types';

export class CreateCustomerDto implements CreateCustomer {
  @ApiProperty({ example: 'Acme Logistics', description: 'Company name' })
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiProperty({
    example: 'BROKER',
    required: false,
    description:
      'Customer type — BROKER, SHIPPER, THREE_PL (third-party logistics), or CARRIER (outside carrier we hire)',
  })
  @IsOptional()
  @IsEnum(['SHIPPER', 'BROKER', 'THREE_PL', 'CARRIER'], {
    message: 'customerType must be SHIPPER, BROKER, THREE_PL, or CARRIER',
  })
  customerType?: 'SHIPPER' | 'BROKER' | 'THREE_PL' | 'CARRIER';

  @ApiProperty({ example: 'MC-123456', required: false })
  @IsOptional()
  @IsString()
  mcNumber?: string;

  @ApiProperty({ example: '1234567', required: false })
  @IsOptional()
  @IsString()
  dotNumber?: string;

  @ApiProperty({ example: 'NET_30', required: false })
  @IsOptional()
  @IsEnum(['NET_15', 'NET_30', 'NET_45', 'NET_60', 'NET_90', 'COD', 'QUICK_PAY'], { message: 'Invalid payment terms' })
  paymentTerms?: 'NET_15' | 'NET_30' | 'NET_45' | 'NET_60' | 'NET_90' | 'COD' | 'QUICK_PAY';

  @ApiProperty({ example: 50000, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiProperty({ example: '12-3456789', required: false })
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiProperty({
    example: 'FACTORED',
    required: false,
    description: 'Per-customer override; null = use tenant default',
  })
  @IsOptional()
  @IsEnum(['FACTORED', 'DIRECT', 'AMAZON'], { message: 'defaultBillingPath must be FACTORED, DIRECT, or AMAZON' })
  defaultBillingPath?: 'FACTORED' | 'DIRECT' | 'AMAZON';

  @ApiProperty({
    example: 12,
    required: false,
    nullable: true,
    description: 'Per-customer factoring company override; null = use tenant default',
  })
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultFactoringCompanyId?: number | null;

  @ApiProperty({ example: 'billing@acme.com', required: false })
  @IsOptional()
  @IsEmail()
  billingEmail?: string;

  @ApiProperty({ example: '123 Main St', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 'Dallas', required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: 'TX', required: false })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  @ApiProperty({ example: '456 Billing Ave', required: false })
  @IsOptional()
  @IsString()
  billingAddress?: string;

  @ApiProperty({ example: 'Dallas', required: false })
  @IsOptional()
  @IsString()
  billingCity?: string;

  @ApiProperty({ example: 'TX', required: false })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  billingState?: string;

  @ApiProperty({ example: '75201', required: false })
  @IsOptional()
  @IsString()
  billingZip?: string;

  @ApiProperty({ example: 'Important customer', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, description: 'Custom field values' })
  @IsOptional()
  @IsObject()
  customFieldValues?: Record<string, unknown>;
}
