import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class PosListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([20, 50, 100]) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([20, 50, 100]) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) locationId?: number;
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsString() @MaxLength(40) mode?: string;
  @IsOptional() @IsString() @MaxLength(40) kind?: string;
  @IsOptional() @IsIn(['ALL', 'TERMINAL_CASH_COUNT', 'MASTER_CASH_BATCH', 'MASTER_REGISTER_COUNT']) type?: 'ALL' | 'TERMINAL_CASH_COUNT' | 'MASTER_CASH_BATCH' | 'MASTER_REGISTER_COUNT';
  @IsOptional() @IsString() @MaxLength(10) dateFrom?: string;
  @IsOptional() @IsString() @MaxLength(10) dateTo?: string;
}
