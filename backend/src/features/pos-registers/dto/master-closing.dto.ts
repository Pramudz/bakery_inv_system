import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsPositive, IsString, IsUUID, MaxLength, Min, ValidateIf } from 'class-validator';

export class SubmitMasterRegisterCountDto {
  @Type(() => Number) @IsInt() @IsPositive() locationId!: number;
  @Type(() => Number) @IsInt() @IsPositive() posRegisterSessionId!: number;
  @IsUUID('4') submissionKey!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) countedCash!: number;
  @IsString() @IsNotEmpty() @MaxLength(150) masterCashierIdentity!: string;
}

export class VerifyMasterRegisterCountDto {
  @IsUUID('4') verificationKey!: string;
  @IsIn(['APPROVE', 'REJECT']) decision!: 'APPROVE' | 'REJECT';
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) verifiedCountedCash!: number;
  @ValidateIf((dto) => dto.decision === 'REJECT') @IsString() @IsNotEmpty() @MaxLength(255) rejectionReason?: string;
}
