import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class GoodsReceiptLineDto {
  @IsOptional() @IsInt() purchaseOrderLineId?: number;
  @IsOptional() @IsInt() sourceSupplierPriceId?: number;
  @IsInt() productId!: number;
  @IsInt() productUnitId!: number;
  @IsInt() unitId!: number;
  @IsNumber() @Min(0.0001) receivedQty!: number;
  @IsNumber() @Min(0) unitCost!: number;
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  @IsOptional() @IsString() @MaxLength(100) batchNumber?: string;
  @IsOptional() @IsDateString() manufactureDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateGoodsReceiptDto {
  @IsString() @IsIn(['PO_BASED', 'DIRECT']) receiptType!: string;
  @IsOptional() @IsInt() purchaseOrderId?: number;
  @IsInt() supplierId!: number;
  @IsInt() locationId!: number;
  @IsDateString() receiptDate!: string;
  @IsOptional() @IsString() @MaxLength(100) supplierInvoiceNumber?: string;
  @IsOptional() @IsDateString() supplierInvoiceDate?: string;
  @IsOptional() @IsString() @MaxLength(100) supplierDeliveryNoteNumber?: string;
  @IsString() @IsNotEmpty() @MaxLength(3) currencyCode!: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines!: GoodsReceiptLineDto[];
}
