import { PartialType } from '@nestjs/mapped-types';
import { CreatePriceListItemDto } from './create-price-list-items.dto';
export class UpdatePriceListItemDto extends PartialType(CreatePriceListItemDto) {}
