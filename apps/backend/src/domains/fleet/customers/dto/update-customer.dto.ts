import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsEnum, IsNumber, IsInt, IsObject, Min, Length } from 'class-validator';
import type { UpdateCustomer } from '@sally/shared-types';

export class UpdateCustomerDto implements UpdateCustomer {
  @ApiProperty({ example: 'Acme Logistics', required: false })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({ example: 'SHIPPER', required: false })
  @IsOptional()
  @IsEnum(['SHIPPER', 'BROKER'], {
    message: 'customerType must be SHIPPER or BROKER',
  })
  customerType?: 'SHIPPER' | 'BROKER';

  @ApiProperty({ example: 'ACTIVE', required: false })
  @IsOptional()
  @IsEnum(['ACTIVE', 'ON_HOLD', 'SUSPENDED', 'INACTIVE'], {
    message: 'Invalid status',
  })
  status?: 'ACTIVE' | 'ON_HOLD' | 'SUSPENDED' | 'INACTIVE';

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
  @IsEnum(['NET_15', 'NET_30', 'NET_45', 'NET_60', 'NET_90', 'COD', 'QUICK_PAY', ''], {
    message: 'Invalid payment terms',
  })
  paymentTerms?: 'NET_15' | 'NET_30' | 'NET_45' | 'NET_60' | 'NET_90' | 'COD' | 'QUICK_PAY' | '';

  @ApiProperty({ example: 50000, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number | null;

  @ApiProperty({ example: '12-3456789', required: false })
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiProperty({
    example: 'DIRECT',
    required: false,
    enum: ['DIRECT', 'FACTORED', 'AMAZON'],
  })
  @IsOptional()
  @IsEnum(['DIRECT', 'FACTORED', 'AMAZON'], { message: 'Invalid billing path' })
  defaultBillingPath?: 'DIRECT' | 'FACTORED' | 'AMAZON';

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
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

  @ApiProperty({
    example: 'Important customer, always delivers on time',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, description: 'Custom field values' })
  @IsOptional()
  @IsObject()
  customFieldValues?: Record<string, unknown>;
}
