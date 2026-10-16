import { Type } from 'class-transformer';
import { IsIn, IsNumber, Min } from 'class-validator';
export class RetailDiscountDto {
  @IsIn(['PERCENTAGE', 'AMOUNT']) type!: 'PERCENTAGE' | 'AMOUNT';
  @Type(() => Number) @IsNumber() @Min(0) value!: number;
}
