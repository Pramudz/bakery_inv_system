import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsString, IsUUID, MaxLength, Min, ValidateIf } from 'class-validator';

export class SubmitCashCountDto {
  @IsUUID('4') submissionKey!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) countedCash!: number;
}

export class VerifyCashCountDto {
  @IsUUID('4') verificationKey!: string;
  @IsIn(['APPROVE', 'REJECT']) decision!: 'APPROVE' | 'REJECT';
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) verifiedCountedCash!: number;
  @ValidateIf((dto) => dto.decision === 'REJECT') @IsString() @IsNotEmpty() @MaxLength(255) rejectionReason?: string;
}
