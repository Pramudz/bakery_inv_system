import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsEmpty } from 'class-validator';
import { CreateSupplierDto } from './create-suppliers.dto';

export class UpdateSupplierDto extends PartialType(OmitType(CreateSupplierDto, ['supplierCode'] as const)) {
  @IsEmpty({ message: 'Supplier code cannot be changed after creation.' }) supplierCode?: never;
}
