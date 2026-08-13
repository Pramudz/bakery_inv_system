import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';
export class CreateProductAttributesDto {
  @IsInt() productId!: number;
  @IsInt() attributeId!: number;
  @IsString() @IsNotEmpty() @MaxLength(500) value!: string;
}
