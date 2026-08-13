import { PartialType } from '@nestjs/mapped-types';
import { CreateProductAttributesDto } from './create-product-attributes.dto';
export class UpdateProductAttributesDto extends PartialType(CreateProductAttributesDto) {}
