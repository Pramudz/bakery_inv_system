import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductAttributes } from './product-attributes.entity';
import { CreateProductAttributesDto } from './dto/create-product-attributes.dto';
import { UpdateProductAttributesDto } from './dto/update-product-attributes.dto';
@Injectable()
export class ProductAttributesService {
  constructor(@InjectRepository(ProductAttributes) private readonly repo:Repository<ProductAttributes> ) {}
  findAll() { return this.repo.find({order:{productAttributeId:'ASC'}}); }
  async findOne(id:number) {
    const row=await this.repo.findOneBy({productAttributeId:id} as any);
    if(!row) throw new NotFoundException('ProductAttributes not found');
    return row;
  }
  async create(dto:CreateProductAttributesDto) {
    return this.repo.save(this.repo.create(dto as any));
  }
  async update(id:number,dto:UpdateProductAttributesDto) {
    await this.findOne(id); await this.repo.update(id,dto as any); return this.findOne(id);
  }
  async deactivate(id:number) {
    await this.findOne(id); await this.repo.update(id,{isActive:false} as any); return this.findOne(id);
  }
}
