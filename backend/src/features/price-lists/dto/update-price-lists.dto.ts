import { PartialType } from '@nestjs/mapped-types';
import { CreatePriceListDto } from './create-price-lists.dto';
export class UpdatePriceListDto extends PartialType(CreatePriceListDto) {}
