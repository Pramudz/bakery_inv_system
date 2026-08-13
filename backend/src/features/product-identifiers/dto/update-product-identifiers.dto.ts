import { PartialType } from '@nestjs/mapped-types';
import { CreateProductIdentifierDto } from './create-product-identifiers.dto';
export class UpdateProductIdentifierDto extends PartialType(CreateProductIdentifierDto) {}
