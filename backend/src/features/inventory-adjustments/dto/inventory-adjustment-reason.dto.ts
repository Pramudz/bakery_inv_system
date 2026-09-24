import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateInventoryAdjustmentReasonDto {
  @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_]*$/) @MaxLength(50) code!: string;
  @IsString() @MaxLength(150) name!: string;
  @IsIn(['IN', 'OUT', 'BOTH']) allowedDirection!: 'IN' | 'OUT' | 'BOTH';
  @IsOptional() @IsString() @MaxLength(100) reasonCategory?: string;
  @IsIn(['CURRENT_WAVG', 'MANUAL_REQUIRED']) costingPolicy!: 'CURRENT_WAVG' | 'MANUAL_REQUIRED';
  @IsOptional() @IsBoolean() requiresRemarks?: boolean;
  @IsOptional() @IsBoolean() requiresApproval?: boolean;
}

export class UpdateInventoryAdjustmentReasonDto extends PartialType(CreateInventoryAdjustmentReasonDto) {}

export class SetInventoryAdjustmentReasonActiveDto {
  @IsBoolean() isActive!: boolean;
}
