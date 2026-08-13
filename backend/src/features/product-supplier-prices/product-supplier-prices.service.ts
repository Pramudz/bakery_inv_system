import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductSupplierPrice } from './product-supplier-price.entity';
import { CreateProductSupplierPriceDto } from './dto/create-product-supplier-price.dto';

@Injectable()
export class ProductSupplierPricesService {
  constructor(@InjectRepository(ProductSupplierPrice) private readonly repo: Repository<ProductSupplierPrice>) {}
  findAll() { return this.repo.find({order:{productSupplierPriceId:'ASC'}}); }
  async findOne(id:number) {
    const row=await this.repo.findOneBy({productSupplierPriceId:id});
    if(!row) throw new NotFoundException('Product supplier price not found');
    return row;
  }
  async create(dto:CreateProductSupplierPriceDto) {
    return this.repo.save(this.repo.create({
      ...dto,
      purchasePrice:String(dto.purchasePrice),
      minimumQuantity:String(dto.minimumQuantity),
      effectiveFrom:new Date(dto.effectiveFrom),
      effectiveTo:dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      currencyCode:dto.currencyCode ?? 'LKR'
    }));
  }
}
