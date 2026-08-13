import { PartialType } from '@nestjs/mapped-types';
import { CreateProductSupplierDto } from './create-product-suppliers.dto';
export class UpdateProductSupplierDto extends PartialType(CreateProductSupplierDto) {}
