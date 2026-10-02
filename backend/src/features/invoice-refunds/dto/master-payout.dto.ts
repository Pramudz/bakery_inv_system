import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';

export class MasterPayoutBaseDto {
  @IsUUID('4') payoutKey!: string;
  @Type(() => Number) @IsInt() @IsPositive() locationId!: number;
  @Type(() => Number) @IsInt() @IsPositive() posRegisterSessionId!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount!: number;
  @IsString() @IsNotEmpty() @MaxLength(255) reason!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) physicalPayerIdentity!: string;
}

export class MasterRefundPayoutDto extends MasterPayoutBaseDto {
  @Type(() => Number) @IsInt() @IsPositive() paymentMethodId!: number;
}

export class MasterReversalPayoutDto extends MasterPayoutBaseDto {}
