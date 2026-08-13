import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ProductSupplierPricesService } from './product-supplier-prices.service';
import { CreateProductSupplierPriceDto } from './dto/create-product-supplier-price.dto';

@Controller('product-supplier-prices')
export class ProductSupplierPricesController {
  constructor(private readonly service:ProductSupplierPricesService){}
  @Get() findAll(){return this.service.findAll();}
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number){return this.service.findOne(id);}
  @Post() create(@Body() dto:CreateProductSupplierPriceDto){return this.service.create(dto);}
}
