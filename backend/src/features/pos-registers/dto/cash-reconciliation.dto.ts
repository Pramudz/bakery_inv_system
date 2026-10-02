import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf } from 'class-validator';

export class SubmitCashCountDto {
  @IsUUID('4') submissionKey!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) countedCash!: number;
}

export class SubmitMasterCashBatchDto {
  @IsUUID('4') submissionKey!: string;
}

export class VerifyCashCountDto {
  @IsUUID('4') verificationKey!: string;
  @IsIn(['APPROVE', 'REJECT']) decision!: 'APPROVE' | 'REJECT';
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) verifiedCountedCash?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) confirmedNetCash?: number;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) physicalRecipientIdentity?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) verificationReason?: string;
  @ValidateIf((dto) => dto.decision === 'REJECT') @IsString() @IsNotEmpty() @MaxLength(255) rejectionReason?: string;
}
