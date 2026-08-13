import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductIdentifier } from './product-identifiers.entity';
import { CreateProductIdentifierDto } from './dto/create-product-identifiers.dto';
import { UpdateProductIdentifierDto } from './dto/update-product-identifiers.dto';
@Injectable()
export class ProductIdentifierService {
  constructor(@InjectRepository(ProductIdentifier) private readonly repo:Repository<ProductIdentifier> ) {}
  findAll() { return this.repo.find({order:{productIdentifierId:'ASC'}}); }
  async findOne(id:number) {
    const row=await this.repo.findOneBy({productIdentifierId:id} as any);
    if(!row) throw new NotFoundException('ProductIdentifier not found');
    return row;
  }
  async create(dto:CreateProductIdentifierDto) {
    return this.repo.save(this.repo.create(dto as any));
  }
  async update(id:number,dto:UpdateProductIdentifierDto) {
    await this.findOne(id); await this.repo.update(id,dto as any); return this.findOne(id);
  }
  async deactivate(id:number) {
    await this.findOne(id); await this.repo.update(id,{isActive:false} as any); return this.findOne(id);
  }
}
