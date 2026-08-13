import { PartialType } from '@nestjs/mapped-types';
import { CreateProductLocationDto } from './create-product-locations.dto';
export class UpdateProductLocationDto extends PartialType(CreateProductLocationDto) {}
