import { PartialType } from '@nestjs/mapped-types';
import { CreateProductUnitDto } from './create-product-units.dto';
export class UpdateProductUnitDto extends PartialType(CreateProductUnitDto) {}
